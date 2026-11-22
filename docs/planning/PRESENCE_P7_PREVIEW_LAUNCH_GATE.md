# Dynamic Island Population — P7：Preview Launch Gate

> 記錄日期：2026-11-21～22（Asia/Taipei）。分支 `presence/visitor-population`，工作目錄 `../logic-island-presence`。
> 狀態：**程式與本機驗證完成，Draft PR [#44](https://github.com/vince115/logic-island/pull/44) 已開，`trials-ci` 通過；所有旗標仍預設關閉**。Preview Launch Gate 的判定在 §8.3。沒有建立任何雲端資源、沒有修改任何環境變數或 Firewall 設定、沒有部署、沒有合併 `main`。
> 前一輪：[PRESENCE_P6_PRODUCTION_READINESS.md](PRESENCE_P6_PRODUCTION_READINESS.md)。本文件更新其中兩件事：心跳與逾時的時間（30／90 秒 → 60／150 秒），以及共用儲存的寫入方式與費用（§3）。
> 需要你決定或動手的事項集中在 §8。
> 2026-11-22 補記：你核准了 Vercel 的唯讀授權，§2 的五項盤點已完成（只讀，沒有改任何設定）。
> 2026-11-22 再補記：既有 Upstash 整合的資料庫讀不到（§2.4）；在等你處理 Redis 的期間，用本機的「三個 instance＋一個共用 Redis」預演了你列的八個驗收項目，全部通過（§10）。

## 1. 本輪範圍與結果

| 項目 | 內容 | 結果 |
|---|---|---|
| 前置 | 核對 HEAD、遠端與 `main` | 開始時本機與 `origin/presence/visitor-population` 都是 `6f3780f`，`main` 仍是 `f36ba39`，沒有未提交變更，沒有既有 PR |
| 1 | Vercel 唯讀盤點 | 起初回 403；你核准授權後**五項都讀到了**（§2.3）：Hobby、函式在 `iad1`、Production 沒有任何環境變數、Upstash 整合已安裝但沒有接到專案 |
| 2 | Redis 成本優化 | 每日計費命令數降低 44–59%（§3）；P1-44 的修正沒有動，並多了一層測試。過程中找到並修掉兩個多分頁的問題（§3.2） |
| 3 | Preview 安全檢查 | 七項都有結論（§4）；補了兩個「儲存失效」的防護 |
| 4 | Draft PR 與 CI | PR #44（Draft）；`trials-ci` 通過；期間兩度併入前進的 `main`（§5） |
| 5 | Preview 驗收準備 | 不需要付費資源的部分都完成；Upstash Free 的條件在 §6，**等你同意後才建立** |
| 6 | 本機 Preview 預演（2026-11-22 追加） | 三個 instance 共用一個 Redis：驗收腳本 18 通過／0 失敗／2 略過，儲存故障注入 8／8，儲存失效 10／10（§10） |

## 2. Vercel 授權與環境盤點

### 2.1 授權的經過

以 Vercel 連線讀取專案（`GET /v9/projects/logic-island`，團隊 `vince115s-projects`）起初是 **403 forbidden**（「You must re-authenticate to this scope」）。連線登入的帳號是對的（`vince115`，預設團隊就是 `vince115s-projects`），缺的是這個團隊的授權；本機 `vercel` CLI 登入的是另一個帳號（`devince1105-5412`），所以沒有改用它。

授權連結只能用一次、10 分鐘內有效。前兩個連結沒有生效（重試時距離產生已經隔了數小時與約 44 分鐘，推測是過期；Vercel 沒有回報原因），第三個生效。每次你回覆之後我只重試一次，沒有對無效的授權反覆請求。

### 2.2 讀取的範圍

只讀你列的五項：專案與 Production branch、函式部署區域、Preview 環境變數**名稱**、已安裝的整合、方案。沒有要求解密，沒有讀取 Firewall、網域、帳單明細或其他專案，沒有寫入任何東西。

環境變數的列表 API 會連同名稱回傳加密後的密文（不是明文，也沒有解密）；那段密文沒有寫進任何檔案，也沒有在回覆裡輸出。

### 2.3 盤點結果（2026-11-22，Vercel 連線唯讀）

| 項目 | 結果 | 依據 |
|---|---|---|
| 專案 | `vince115s-projects/logic-island`（`prj_u8xRf8LrE0cglbuauQDSTKBAhcn0`），Next.js，Node.js 設定為 26.x | `get_project` |
| Production branch | Production 部署來自 **`main`**：最新一個是 `f18aafa`（PR #58 的合併），別名 `logic-island-psi.vercel.app`、`logic-island-vince115s-projects.vercel.app`、`logic-island-git-main-vince115s-projects.vercel.app` | 最新 Production 部署的來源。「Production Branch」這個設定欄位本身不在回應裡，這是從部署推得的 |
| 函式部署區域 | **`iad1`（美國東岸，Washington, D.C.）**，Production 與本分支最新的 Preview（`21a8f12`）都是 | 兩個部署的 `regions`。`iad1` 是 Vercel 的預設值；Hobby 可以改選任一個單一區域（官方文件） |
| 環境變數名稱 | 整個專案只有 **1 個**：`LOGIC_ISLAND_REGIONAL_WORLD`，範圍 Preview、只給分支 `preview/a1p-world`（P8 的 A1-P 驗收用）。**Production 沒有任何變數**；沒有任何 `LOGIC_ISLAND_PRESENCE*`、`KV_REST_API_*`、`UPSTASH_*` | `filter_project_envs`（`hiddenProductionEnvCount` 為 0） |
| 已安裝的整合 | 團隊層級有 **Upstash**（Marketplace，2026-02-07 安裝），**沒有接到任何專案**（`projects` 是空的） | `list_integration_configurations`。這個安裝底下是否已經有資料庫，不在這次讀取的範圍內，**未知** |
| 方案 | **Hobby**（帳號的帳單資料；團隊的回應裡沒有方案欄位） | `get_auth_user` |
| 部署保護 | Vercel Authentication 開啟（`all_except_custom_domains`）；沒有密碼保護、沒有 Trusted IPs。實際觀察：正式網址公開可讀，分支的 Preview 網址要登入 | `get_project`；先前對正式網址的請求 |
| Production 有沒有 Presence API | **沒有**：`GET` 與 `POST /api/presence` 都回 404；而且 Production 沒有任何環境變數，所以旗標沒有被設定 | 對正式網址各請求一次；上面的變數列表 |
| 邊緣節點 | 從台灣連到 `hkg1` | 回應標頭 |

這些結果帶來的四個結論：

1. **Production 是乾淨的**：沒有變數、沒有接上儲存。Presence 在 Production 要出現，必須有人同時新增旗標、金鑰與儲存位址，而且通過 preflight 的宣告檢查。
2. **本分支的 Preview 目前也沒有 Presence**：三個變數與儲存都還沒設（§6.3），所以現在的 Preview 是預設 build。
3. **Redis 應該開在美國東岸**（Upstash 的 `us-east-1`，N. Virginia），和函式同區。每次回報函式要對 Redis 發 1–3 個請求；兩者同區時每個請求通常是幾毫秒，跨太平洋則是一兩百毫秒的等級（一般的網路距離估計，沒有在這個專案上量過；區域名稱以建立畫面的選項為準）。台灣訪客到函式的那一段（`hkg1` → `iad1`）不論 Redis 放哪裡都一樣。我不建議為了這件事改函式區域：那是專案層級的設定，會連 Production 一起改。
4. **限流用 Hobby 的那一組**（§4.6）：只有 1 條限流規則。

### 2.4 既有的 Upstash 整合底下有沒有資料庫（2026-11-22）

你要我先確認這一點。結論：**目前的授權讀不到，需要你看一眼或多給一項授權**。

| 我試了什麼（都是唯讀） | 結果 |
|---|---|
| 讀取這個安裝本身（`get_configuration`） | 讀得到，但只有安裝的資料：沒有接任何專案（`projects` 是空的），權限含 `read-write:integration-resource`。**回應裡沒有資源清單** |
| 列出這個安裝能建立的產品（`list_integration_configuration_products`） | Upstash for Redis、QStash／Workflow、Search、Vector。Redis 的主要區域可以選 `iad1`（與函式同區） |
| 列出 Redis 的計費方案（`list_integration_billing_plans`，區域 `iad1`） | **只列出 Pay As You Go 與 Fixed 250MB～500GB，每一個都標示需要付款方式；清單裡沒有 Free** |
| 列出團隊的儲存資源 | Vercel 連線沒有這個工具（只有「依 ID 讀取一個」，而我沒有 ID，也不會去猜） |
| 用 App 內建瀏覽器開 Team → Storage 頁面 | 轉到登入頁：內建瀏覽器沒有登入 Vercel。我沒有登入，也沒有用本機 CLI（那是另一個帳號） |

從專案這一側可以確定的：`logic-island` 沒有接任何儲存（沒有任何 `KV_*`／`UPSTASH_*` 變數，§2.3），所以**就算有既有的資料庫，也沒有接到這個專案**。

**方案清單裡沒有 Free，這一點要先弄清楚再建立**。可能的原因我分不出來：這個 Upstash 帳號已經用掉唯一的免費資料庫；帳號已經有付款方式（Upstash 的規則是有付款方式就不能有免費資料庫，§6.2）；或是這個 API 本來就不列免費方案。不論是哪一個，**如果建立畫面上沒有 Free 可選，建立資料庫就是建立付費資源**，那是你的決定，不是我能自己做的。

要補上這一項，三選一：

1. **你自己看（最快）**：打開 `https://vercel.com/vince115s-projects/~/stores`，告訴我有幾個 Upstash 資源、各叫什麼、方案是什麼；再按一次「Create Database → Upstash for Redis」看方案選單有沒有 Free（看完關掉，不要建立）。
2. **讓我看**：在 App 的瀏覽器分頁登入 vercel.com（`vince115` 帳號）。範圍：我只讀 Team → Storage 的清單頁，以及建立畫面的方案選單（不送出）。不讀任何連線字串或 Token。
3. 把本機 `vercel` CLI 換成 `vince115` 帳號登入（`vercel login`）。範圍：我只執行 `vercel integration list` 這類列表指令。這會改變你本機 CLI 的登入狀態，所以我不建議為這件事做。

## 3. Redis 成本優化

### 3.1 分析：錢花在哪裡

P6 的實測是每次心跳 3 個計費命令（多個 instance 輪流時 4 個）。拆開來看有兩個因素：

1. **次數**。每個可見的分頁每 30 秒回報一次。訪客離開時會主動告別（立即不計入），所以這個間隔只決定一件事：沒有告別就消失的訪客（當機、斷線）還會被多算多久。
2. **每次的命令數**。每次回報都用指令稿做「比較後寫入」，Upstash 把指令稿算成 1 個，裡面每個指令再各算 1 個，所以最少是 3。但絕大多數的回報**沒有新內容**：同一個分頁、同一頁、還在前景，只是再說一次「我還在」。它唯一改變的是「最後一次聽到的時間」。

### 3.2 做了什麼

| 改動 | 內容 | 效果 |
|---|---|---|
| **A. 心跳 60 秒、逾時 150 秒** | 原為 30／90 秒。擁有者沉默後由其他分頁接手的時間同步由 45 改為 90 秒 | 回報次數由每位訪客每天約 3,300 次降到約 1,900 次（換頁與回到前景的回報不變） |
| **B. 脈衝（pulse）** | 「沒有新內容」的回報不再重寫記錄，而是用**一個普通的 `HSET`** 寫到記錄旁邊的欄位。計數或下一次寫記錄時，再用引擎的規則把它併進記錄 | 這種回報由 3 個命令降為 1 個（要先讀的 instance 由 4 降為 2） |

| **C. 分頁之間的通知** | 一個分頁告別時，用 `BroadcastChannel` 告訴同一個瀏覽器的其他分頁；還在前景的分頁 1.5 秒後自己再回報一次 | 不省命令，是為了抵銷 A 的一個副作用（見下） |

A 與 B 合計的實測結果在 §3.5。

**C 的原因**：訪客關掉（或切走）正在使用的分頁時，Session 會被標為離開；另一個還在前景的分頁如果沒有因此得到焦點（例如兩個並排的視窗，焦點跑到別的程式），伺服器要等它的下一次回報才知道訪客還在。這是 P6 就記錄的限制，當時最多少算 30 秒；心跳改成 60 秒之後會變成最多 60 秒，本機的驗收腳本也因此抓到。現在還在的分頁會在 1.5 秒後回報，訪客立刻被算回來。通道只傳一個固定的字，不含任何識別碼，不寫入瀏覽器的任何儲存；分頁在背景時不開通道；送出 GPC／DNT 的瀏覽器完全不開。沒有 `BroadcastChannel` 的瀏覽器行為和之前一樣（等下一次回報）。

**A 的代價**：沒有告別就消失的訪客，由最多被多算 90 秒變成最多 150 秒。正常離開（關分頁、切到背景、鎖手機）不受影響，仍然立刻不計入。另外有一個改善：之前漏掉一次心跳就會剛好碰到 90 秒邊界而短暫消失；現在漏掉一次（下一次在 120 秒）仍在 150 秒之內。

**B 的原則**：脈衝本身**不做任何決定**。告別、換頁、換分頁仍然是記錄，仍然用「比較後寫入」。脈衝遇到一筆它對不上的記錄（別的 instance 剛寫入告別、另一個分頁接手了）時，只有三種結果：

| 脈衝遇到的記錄 | 結果 |
|---|---|
| 這個分頁在送出脈衝之後告別了 | **不生效**，不論脈衝晚多久到。所以脈衝不可能把已經離開的 Session 救回來 |
| Session 有一個還沒離開的擁有者，但不是脈衝續命的那個狀態 | 只代表「這個 Session 還活著」。**不移動位置，也不把 Session 轉給別的分頁** |
| Session 的擁有者已經離開 | 脈衝的分頁還在，照一般心跳的規則接手 |

第二列是推送 `c58d033` 之後才收緊的。那個版本把這種脈衝交給一般心跳的規則處理，結果在「兩個視窗同時在前景、各由不同的 instance 處理」時，訪客會被輪流算在兩個視窗的頁面上（人數沒有錯，位置會跳）。這是我為了回答「多分頁在不同島嶼間切換是否正確」而加的測試找到的；修正前該測試在替身 Redis 3 個與真 Redis 4 個 instance 上失敗，修正後全數通過（§3.4）。

為了不讓脈衝變成繞過限流的路，有兩個限制：

- 同樣的回報如果在上一次的 15 秒內又來（追蹤器不會這麼快），就不當成脈衝，照舊走指令稿並計入每分鐘 40 次的限流。
- 每筆記錄最晚 10 分鐘重寫一次，所以記錄不會無限期落後。

instance 只有在「沒有跡象顯示別的 instance 也在寫它的 Session」時，才憑自己的記憶直接寫脈衝；一旦發現記憶過期，接下來幾次會先讀再寫（多 1 個命令），連續都對了才恢復。

也可以關掉：`new RedisPresenceStore(redis, { pulses: false })` 就回到 P6 的行為，同一套測試兩種都跑。

### 3.3 評估過但沒有做的

| 做法 | 為什麼不做 |
|---|---|
| 不用指令稿，改成直接覆寫 | 兩個 instance 同時寫會互相蓋掉，正是 P1-44 那一類問題的來源 |
| 把規則搬進 Lua（讓多 instance 也只要 3 個） | 規則會有兩份，P1-44 的修正要維護兩次 |
| 心跳 120 秒、逾時 300 秒 | 還能再省約 35%，但斷線的訪客會多留 5 分鐘；是產品決定，見 §8 的 Q3 |
| 人口 GET 的快取 15 秒 → 30 秒 | 低人數時計數佔了約四成（§3.5），改成 30 秒可再省約 20%；但 15 秒是你在 P6-D 指定的，所以沒有動，見 §8 的 Q3 |
| 伺服器把多位訪客的脈衝合併成一個命令 | 人多時效果很大，但要讓函式在回應後繼續活著，行為依平台而定，本機無法驗證 |
| 計數時不順手清理過期記錄 | 100 人時每次計數 3.7 個命令，只佔總量約 3%，不值得改 |

### 3.4 驗證

你要求驗證的六項，每一項都在三種儲存上跑同一份測試：記憶體版（參考實作）、替身 Redis（1 與 3 個 instance，另有「關掉脈衝」的 3 個 instance）、**本機真 Redis（1 個，以及 4 個各用自己連線的 instance）**。

| 項目 | 測試 | 結果 |
|---|---|---|
| Session TTL | 訪客停留 45 分鐘，每分鐘回報一次，每次都由另一個 instance 計數；最後一次回報後 150,000 毫秒仍計入，150,001 毫秒不計入；之後記錄與脈衝一起清除 | 通過。逾時以最後一次回報為準，不論那次是記錄還是脈衝 |
| 多分頁一致性 | 兩到三個分頁的訪客，30 分鐘的隨機劇本（換頁、切視窗、隱藏、回來、消失），每個請求之後都和記憶體版比對 | 單一 instance：每一次計數**完全相同**。多個 instance：訪客都會告別的劇本**每一次計數完全相同（逐島）**；含「沒有告別就消失」的劇本，計入與否完全相同（位置見下方的限制） |
| 多分頁跨島切換 | 同一位訪客兩個視窗：A 在基礎程式島、B 在資料庫島 → 兩個都在前景 4 分鐘 → 切回 A → A 換到機器學習島 → 切到 B → B 換到 AI 群島頁 → 兩個都在前景 12 分鐘 → 關掉 B → 隱藏 A。每個視窗固定回報給同一個 instance（最容易讓 instance 的記憶過期的排法），每一步都在**每個** instance 上計數 | 每一步都是剛好 1 人，而且在「最後被使用的視窗」所在的島（或群島公共區域）；B 關掉後立刻算在 A 的島；全部離開後 0 人，之後晚到的回報也不會回來 |
| 亂序請求 | P6-A 的排列與亂序契約原封不動再跑一次；新增「兩個分頁相隔數分鐘離開，各自的舊回報最後才到，而且是落在沒聽過告別的 instance 上」 | 通過；所有 instance 都回報 0 人 |
| 背景分頁 | 回報 4 分鐘後切到背景；在每個 instance 上重送離開前的回報；背景 10 分鐘後回來；一分鐘內隱藏又顯示 | 背景期間一律不計入；回來的那一刻就計入 |
| 關掉正在使用的分頁 | 追蹤器測試（分頁之間的通知：1.5 秒後回報、已經排定的回報之後再補一次、背景分頁不聽、GPC 不開通道）；瀏覽器測試「closing the tab in use counts the visitor on the tab that is left, at once」 | 另一個分頁不必做任何事，8 秒內被算回來（沒有通知時最多要等 60 秒） |
| 離線判定 | 沒有告別就消失；中途漏掉一次回報 | 漏一次不會掉；消失後剛好在逾時那一毫秒不再計入；一小時後回來是全新的 Session |
| 2／10／100 人成本 | §3.5 | 替身與真 Redis 的帳單 12 個情境逐一相同 |

另外兩層：

- **引擎**：3,000 個單一訪客的隨機劇本（一到三個分頁、每個 30 步），「每次都重寫記錄」與「能用脈衝就用脈衝」逐步比對，計數與記錄內容完全相同；其中約 2 萬多步是脈衝。
- **限流**：同一個回報每秒重送一次、分散到所有 instance，仍然剛好只有 40 次被接受。

**P1-44 沒有被破壞的依據**：P6-A 的 21 項測試沒有修改、全數通過；上表「亂序請求」與引擎測試「never undoes a goodbye…」直接針對「脈衝最後才到」這個新路徑。

**新的限制（KNOWN_ISSUES P1-49）**，只剩一種情況：同一位訪客有兩個視窗在前景，**比較新的那個沒有告別就消失**（當機、斷線），而且還在的那個視窗剛好由一個不知道新視窗存在的 instance 處理。這時訪客仍然被計入一次，但會多留在消失的那個視窗的頁面上一段時間：單一 instance 是 100 秒，多個 instance 在測試的排法下是 460 秒，上限是「記錄重寫的 10 分鐘加三次回報」。有測試固定「人數始終是 1」與這個上限。正常關閉視窗（有告別）不受影響，立刻算在還在的視窗。

**沒有改變的既有限制**：回報晚到超過逾時（現在是 150 秒，原為 90 秒）時，Session 已經過期，那個回報會被當成新的開始。這是 P6 就有的行為；逾時變長之後，這個視窗反而變大了。

**registry 的變化**：寫這份記錄的期間，`main` 併入了電腦網路島的前 5 堂課（PR #47）。它依 registry 自動變成「已開放」，所以現在會計入訪客、畫出人影的是 CS 的 6 座島加互動實驗島（P6 當時是 5 座）；其餘 23 座學科島仍是規劃中。這是 P6-B 規則的預期結果，程式沒有為此修改。

### 3.5 優化後的成本

量法與 P6 相同（`tests/presence-redis-cost.test.ts`：用真正的 API 函式在虛擬時鐘上模擬 24 小時，訪客停留 5–15 分鐘、平均每 2 分鐘換一頁），原始數字在 [`evidence/presence/p7/redis-cost.json`](evidence/presence/p7/redis-cost.json)。這是對本機 Redis 與官方計費規則的量測，**不是 Upstash 的實際帳單**。

每個請求：

| | 1 個 instance | 3 個 instance | P6 |
|---|---|---|---|
| 每次回報（平均） | 2.06–2.11 | 3.03–3.09 | 3.1／4.1 |
| 　其中沒有新內容的回報 | 1 | 2 | 3／4 |
| 　其中換頁、回到前景 | 3 | 4 | 3／4 |
| 每次告別 | 3.0–3.2 | 4.1–4.2 | 3.0／4.0 |
| 每次計數（2／10／100 人） | 1.15／1.66／3.73 | 同左 | 相同 |

平均值沒有降到 1，是因為模擬的訪客每 2 分鐘換一頁，一半的回報本來就是換頁。停在同一頁的訪客是每次 1 個（`tests/presence-redis-cost.test.ts`「bills one command a report for a visitor who stays on one page」）。

每日與每月的計費命令數（每格是「沒人看地圖」～「全天有人看地圖」）：

| 同時在線 | instance | 每日 | 每月（×30） | P6 的每月 | 降幅 |
|---|---|---|---|---|---|
| 2 | 1 | 9,002～15,499 | 27 萬～46 萬 | 65 萬～84 萬 | 58%～45% |
| 2 | 3 | 12,914～19,440 | 39 萬～58 萬 | 84 萬～105 萬 | 54%～44% |
| 10 | 1 | 43,930～53,351 | 132 萬～160 萬 | 320 萬～348 萬 | 59%～54% |
| 10 | 3 | 63,281～72,335 | 190 萬～217 萬 | 421 萬～450 萬 | 55%～52% |
| 100 | 1 | 432,888～454,334 | 1,299 萬～1,363 萬 | 3,184 萬～3,248 萬 | 59%～58% |
| 100 | 3 | 631,181～653,393 | 1,894 萬～1,960 萬 | 4,202 萬～4,271 萬 | 55%～54% |

換算（價格是 2026-11-22 讀到的官方頁面，以該頁為準）：

| | P7 | P6 |
|---|---|---|
| 每「訪客 · 小時」 | 約 190 個命令（3 個 instance 約 270） | 約 450（590） |
| **Upstash Free（每月 50 萬）撐得住的平均同時在線人數** | **約 1.6～3.7 人** | 約 0.7～1.5 人 |
| 2 人全天在線 | 四個情境中三個在 Free 之內；全天有人看地圖且 3 個 instance 時超過（58 萬） | 全部超過 |
| 隨用隨付（每 10 萬命令 US$0.20） | 2 人 US$0.5–1.2／月；10 人 US$2.6–4.3；100 人 US$26–39 | 1.3–2.1；6.4–9.0；64–85 |
| 固定月費 US$10（不計命令數） | 約 25–40 人以上比隨用隨付便宜 | 約 12–15 人以上 |

- **結論**：Free 足夠做 Preview 驗收（§6.2 的估算是幾千個命令），也足夠低流量的 Production；平均同時在線超過 2–3 人就要改方案。這是實際流量決定的，上線後才知道。
- **流量**：脈衝是很短的普通指令，不必送指令稿全文。100 人時每月進 10–12 GB、出最多 10.5 GB（P6 為進 21–24 GB）。Free 的 10 GB 大約在 45 人時用完，但命令數早就先到上限。
- **記憶體**：100 人時約 60–90 KB。

## 4. Preview 安全檢查

### 4.1 GPC／DNT

**保留，沒有動。** `PRESENCE.honorPrivacySignals` 仍為 `true`；追蹤器端與伺服器端的測試都沒有修改、全數通過。驗收腳本的 `privacy.gpc` 會在 Preview 上再確認一次。

### 4.2 Presence API 的 preflight 白名單

**保留，沒有動。** `scripts/trials/` 與 `tests/trials-preflight.test.ts` 在本輪沒有任何變更（`git diff 6f3780f -- scripts tests/trials-preflight.test.ts` 為空）。本機以 CI 的旗標重現 preflight 的結果在 §7。

### 4.3 Production 預設不含 Presence API

| 檢查 | 結果 |
|---|---|
| 預設 build 的 route handler 數量 | 見 §7（0 個才通過） |
| 沒有宣告 `LOGIC_ISLAND_PRESENCE=1` 卻含有 Presence 的 build | preflight 的 `routes` 與 `probe` 兩項擋下（設計如此），見 §7 |
| 正式網站 | `GET` 與 `POST https://logic-island-psi.vercel.app/api/presence` 都回 **404**（2026-11-22） |
| PR 對 Production 的影響 | 沒有。旗標是 build 時的環境變數；這個 PR 不改任何 Vercel 設定，合併後 Production 的 build 仍然沒有 API、沒有追蹤器、沒有 NPC |

### 4.4 Preview 與 Production 的 Redis Key 隔離

三層，任何一層單獨就夠：

1. **連線**：依 §6.3 只把儲存接到 Preview（而且只接這個分支）。Production 沒有位址與 Token，連都連不上。
2. **Key**：Key 的前綴是 `li:presence:<VERCEL_ENV>`，Preview 是 `li:presence:preview:sessions`，Production 是 `li:presence:production:sessions`。就算兩個環境誤用同一個資料庫，也不會互相計入（`tests/presence-redis-store.test.ts`「keeps each environment's sessions apart…」）。環境名稱只接受小寫英文字，其他一律當成 `local`。
3. **功能**：Production 的 build 沒有 API route，就算拿到位址也沒有程式會去用。

本輪的脈衝沒有新增 Key：仍然是同一個 HASH，欄位名稱多一個 `+` 開頭的。

### 4.5 Redis 失效時不影響課程與 3D 地圖

Presence 與網站其餘部分本來就沒有相依：頁面是靜態的，追蹤器與地圖的人口查詢都是失敗就算了。本輪補了兩個原本的缺口，並實際驗證：

| 缺口 | 修正 |
|---|---|
| 儲存沒有回應時，請求會一直等到平台的函式逾時（預設可達 300 秒） | 每個指令 3 秒逾時，之後 API 回 503 `unavailable`，回應不含儲存的位址、Token 或錯誤細節 |
| 儲存壞掉之後，地圖會一直顯示壞掉之前的人影 | 超過逾時（150 秒）都問不到數字，地圖就不再顯示人影；問得到之後自動恢復 |

驗證（`docs/planning/evidence/presence/tools/store-outage-check.mjs`，本機 live build，儲存位址指向一個沒有東西在聽的埠）：結果見 §7。它檢查 API 快速回 503、首頁地圖照常繪製且沒有訪客人影、可以聚焦島嶼、課程頁的播放器可以操作、課程總覽與群島頁正常、沒有任何頁面錯誤，桌機與手機尺寸各一次。

各種失效對訪客的表現都一樣：

| 情況 | API | 訪客看到的 |
|---|---|---|
| 儲存連不上、太慢、Free 額度用完、預算上限到了 | 503 `unavailable`，追蹤器 60 秒後再試 | 地圖沒有即時人影；其餘完全正常 |
| 沒有設金鑰或儲存（Production；Preview 沒設金鑰） | 503 `unconfigured` | 同上 |
| 旗標沒開 | 404 | 沒有任何 Presence 的程式在跑 |

### 4.6 API 限流與濫用防護的部署方案

**程式裡已有的（不需要部署）**：

| 防護 | 擋什麼 |
|---|---|
| 只接受同站請求（`Sec-Fetch-Site`／`Origin`） | 別的網站的頁面替訪客送請求 |
| Cookie 回傳後還要過 2 秒暖機才建立 Session | 不留 Cookie 的腳本與爬蟲（不佔任何儲存） |
| 每個 Session 每分鐘 40 次寫入，超過回 429；被拒絕的寫入不花 Redis 命令 | 單一 Session 灌水 |
| Session 上限 50,000；請求本文上限 512 位元組；位置由伺服器從 registry 解析 | 塞爆儲存、塞垃圾資料 |
| 自稱爬蟲的 User-Agent 不計入 | 連結預覽、監控 |
| 儲存 3 秒逾時（本輪） | 儲存變慢時拖住函式 |

**程式擋不了的**：願意保留 Cookie 的攻擊者可以不斷建立新的 Session。系統不讀 IP，所以這一層只能交給平台。

**建議的部署（都需要你動手，我沒有設定任何一項）**：

| 層 | 設定 | 說明 |
|---|---|---|
| Vercel Firewall | Project → Firewall → Add Rule：條件 `Request Path` Equals `/api/presence`；動作 Rate Limit，Fixed Window 60 秒、每個 IP 300 次、超過回 429 | **本專案是 Hobby（§2.3），用這一組。** Hobby 方案只能有 **1 條**限流規則（自訂規則共 3 條），所以用一條涵蓋 GET 與 POST。正常瀏覽器每分鐘約 4 次 GET 加 1–2 次 POST；300 次約等於同一個 IP 後面有 50 位學生同時上課 |
| 　（升級到 Pro 之後可以分成兩條） | ① 上述條件再加 `Method` Equals `POST`：每個 IP 每 60 秒 120 次；② 不分方法：每個 IP 每 60 秒 600 次 | 寫入才花 Redis 命令，值得單獨設得更緊 |
| Upstash | Free：不綁付款方式，額度就是硬上限（用完回錯誤，本系統回 503）。隨用隨付：在資料庫上設每月預算，到 70% 與 90% 會寄信，到了就限流而不再計費 | 預算是「每個資料庫」設定，不是整個帳號 |
| 緊急關閉 | 移除 Preview 的 `LOGIC_ISLAND_PRESENCE`（或設成 `0`）後重新部署；或在 Vercel 的 Storage 頁面中斷資料庫連線 | 前者讓 API 回 404、頁面不再載入追蹤器；後者讓 API 回 503 |

限流規則的已知限制（官方文件）：計數是**每個區域各算各的**，所以跨區域的流量可以超過設定值；Hobby 與 Pro 只能用 IP 或 JA4 當計數的鍵，視窗 10 秒到 10 分鐘。官方文件沒有說明規則是否也套用在 Preview 網址，以及由 CDN 快取回應的請求算不算，這兩點要在 Preview 上實測。

同一個 IP 後面有整班學生是這個網站的常見情況，所以數字寧可寬一點；真正的上限是 Upstash 那一層。

### 4.7 Cookie 與隱私說明一致性

逐項核對的結果在 [PRESENCE_PRIVACY.md](PRESENCE_PRIVACY.md) §1.2。結論：

- Cookie 的名稱、屬性、內容、換新規則**都沒有變**，瀏覽器測試仍檢查實際的 Cookie 屬性。
- 說明文字草案有兩處因為本輪而過時，已更新：「每 30 秒」→「每分鐘」，「90 秒」→「兩分半鐘」。
- 脈衝沒有新增資料種類（分頁的隨機標籤、時間、位置、限流計數，都是記錄裡已有的），有測試逐欄比對。
- 說明文字仍是草案，還沒有放上網站；要不要放、放哪裡、要不要同意機制仍由你決定（該文件 §5）。

## 5. Draft PR 與 CI

**[vince115/logic-island#44](https://github.com/vince115/logic-island/pull/44)**：`presence/visitor-population` → `main`，**Draft**，沒有啟用自動合併。

| 要求 | 狀況 |
|---|---|
| 不自動合併 | Draft；auto-merge 關閉；我沒有也不會合併 |
| 不啟用 Production Presence | PR 不含任何 Vercel 設定；旗標是 build 時的環境變數，沒有動。合併後 Production 的 build 仍然沒有 API（§4.3） |
| 不修改 Production 環境變數 | 沒有修改任何環境變數（我也沒有存取權，§2） |
| 執行既有的 `trials-ci` | 見下表 |
| 不含私有題庫資料 | `trials:leak-scan` 對追蹤檔案與 `origin/main..HEAD` 皆 clean（§7） |

`trials-ci`（job `gates`）的執行紀錄：

| HEAD | 結果 | 說明 |
|---|---|---|
| `c58d033`（P7 第一次推送） | **通過**（11 分 56 秒） | |
| `887e40d` | 沒有執行 | 不是失敗：這期間 `main` 併入了 PR #42–#46，PR 與 `main` 在 `docs/handoff/TESTING_STATUS.md` 衝突，GitHub 做不出合併結果就不會啟動 `pull_request` 的工作流程 |
| `a530d96`（併入 `main` `fe3c344`） | **通過**（10 分 14 秒） | 衝突只有那一個文件，兩邊各自新增的段落都保留 |
| `f1ed07f`（併入 `main` `b36c565`，再加兩個測試調整） | **通過**（12 分 45 秒） | `main` 又併入 PR #47（電腦網路島 CN01–CN05）。沒有衝突，但有一個本分支的單元測試因此在本機失敗，推送前已修正（下一段） |
| `21a8f12`、`7c0b330` | **通過** | 只改文件與證據 |
| 併入 `main` `f18aafa` 之後 | 見 PR 頁面 | `main` 又前進了 47 個 commit（PR #48–#58，電腦網路島、AI 基礎島與終端機課程能力）。沒有衝突；本機全套重跑的結果在 §10.4 |
| 之後的文件 commit | 見 PR 頁面 | 只改文件。`main` 仍在前進（其他工作階段的課程批次），PR 落後但可以乾淨合併；CI 每次都以當時最新的 `main` 驗證合併結果 |

**失敗的歸類**：

| 失敗 | 屬於 | 處理 |
|---|---|---|
| `tests/presence-zones.test.ts`「gives every open island…」在併入 `b36c565` 後失敗 | **本分支**。P6 的這個測試把「今天已開放的島」寫死成 5 座加互動實驗島；`main` 讓電腦網路島開放後，名單就不對了。產品行為是對的（是否開放本來就由 registry 決定） | 已修正：名單改由 registry 取得。這個失敗只出現在我本機併入後的那一次執行，沒有在 CI 上出現過 |
| 瀏覽器測試「figures arrive one by one…」在五次整輪執行中失敗一次 | **本分支的測試**。頁面一開始的假資料可能在島上放了不只一個人影，要等多的走掉；機器負載高時 5 秒不夠 | 已修正：等待加長。重複 8 次全過。不屬於 `trials-ci`（CI 的 build 沒有 Presence 旗標，這些測試是略過） |
| `e2e/candidate-integration.spec.ts:179`、`:264` | **`main` 既有**（KNOWN_ISSUES P1-43）。在 `main` `b36c565` 自己的 build 上同樣 2 次失敗 2 次 | 不屬於本分支，沒有處理 |
| `e2e/hex-camera.spec.ts:313` 在一次全套執行中失敗 | **負載相依的既有問題**（同 P1-32 一類）。當時機器上另有其他工作階段在跑 3D 測試（負載約 15）；單獨重跑時 `main` 與本分支的 build 都是 2 次通過 2 次 | 不屬於本分支，沒有處理 |


## 6. Preview 驗收準備

### 6.1 已經完成、不需要付費資源的部分

- 驗收腳本 `preview-validate.mjs` 已配合新的逾時調整（「斷線的訪客」那一項現在讀取 API 自己回報的逾時），並在本機 live build 上重跑（§7）。
- 新的「儲存失效」檢查（§4.5）。
- 人工驗收清單的時間已更新（[PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md)）。
- Preview 的三道保護仍在：Key 帶環境名稱、Preview 沒有金鑰回 503、`x-presence-store` 標頭說明儲存是否共用。

### 6.2 建立 Upstash Free 之前，你需要知道的條件

來源：[Upstash 定價](https://upstash.com/pricing/redis)、[計費說明](https://upstash.com/docs/redis/overall/billing)、[超過請求上限](https://upstash.com/docs/redis/troubleshooting/max_requests_limit)、[Vercel 整合](https://upstash.com/docs/redis/howto/vercelintegration)，2026-11-22 讀取。官方沒有寫明的地方我標出來，不替它猜。

| 你問的 | 內容 |
|---|---|
| **正式計費條件** | （2026-11-22：Vercel 對這個安裝列出的方案裡沒有 Free，見 §2.4；以下是 Upstash 官方頁面的說明。）Free 方案 US$0。**在 Upstash 帳號加入付款方式的那一刻，帳號下所有免費資源都會改為隨用隨付**（官方：「An account with a payment method cannot have free databases」）。之後依用量計費：每 10 萬命令 US$0.20、儲存超過 1 GB 每 GB US$0.25、流量超過 200 GB 每 GB US$0.03。透過 Vercel Marketplace 建立而且讓 Vercel 管理 Upstash 帳號時，付款走 Vercel；建立 Free 資料庫是否需要 Vercel 帳號上有付款方式，**官方頁面沒有寫**，要以安裝畫面為準 |
| **Free 額度** | 每月 50 萬命令、資料 250 MB、每月流量 10 GB、每秒最多 10,000 個命令、單一請求 10 MB；一個免費帳號只能有 **1 個**資料庫 |
| **超額後的行為** | 命令數用完：請求得到錯誤 `ERR max requests limit exceeded`。是否到下個月才恢復、流量或容量超過時怎麼處理，**官方頁面沒有寫**。沒有付款方式就沒有東西可以扣款（這一句是我的推論，不是官方的句子）。對本站：API 回 503，地圖沒有即時人影，其餘正常（§4.5） |
| **預算或用量限制方法** | Free：不綁卡，額度本身就是上限。隨用隨付：每個資料庫可設每月預算，70% 與 90% 寄信，到了就限流、不再計費。程式這一側：每個 Session 每分鐘 40 次寫入、Session 上限、§4.6 的 Firewall 規則。每日用量的檢視方式官方頁面沒有寫，Upstash 主控台有用量圖表 |
| **Preview 專用的連線方式** | §6.3 |

這次驗收預計的用量：自動驗收腳本一次約數百個命令；3 個人手動測 2 小時約 2,000 個（每訪客 · 小時約 190，加上計數）。相對於每月 50 萬，可以忽略。

### 6.3 Preview 專用的連線方式

目標是「只有這個分支的 Preview 會碰到這個資料庫」：

0. 團隊已經裝了 Upstash 整合（§2.3），所以不需要重新安裝；從 Team → Storage（或 Integrations → Upstash）建立資料庫即可。**先看那裡是否已經有一個 Upstash Redis**：免費帳號只能有 1 個資料庫，已經有的話要決定沿用（Key 有 `li:presence:preview:` 前綴，不會和別的資料混在一起）還是另外處理。
1. 資料庫名稱取 `logic-island-presence-preview` 之類，方案選 **Free**，區域選 **美國東岸（`us-east-1`，N. Virginia）**，和函式的 `iad1` 同區（§2.3 的結論 3）。
2. 連接到專案時，環境**只勾 Preview**。Vercel 的連接畫面可以選環境；如果你看到的畫面不能選，就不要用自動注入，改成手動新增下面的變數。（「可以選環境」是我對這個畫面的了解，這次讀到的官方頁面沒有寫明。）
3. 整合會注入位址與 Token。程式認得兩組名稱：`KV_REST_API_URL`＋`KV_REST_API_TOKEN`，或 `UPSTASH_REDIS_REST_URL`＋`UPSTASH_REDIS_REST_TOKEN`。
4. 另外三個變數手動新增，範圍選 **Preview**，並且在「Git Branch」填 `presence/visitor-population`，這樣其他分支的 Preview（其他工作階段的 PR）不會被打開 Presence：
   - `LOGIC_ISLAND_PRESENCE` = `1`
   - `LOGIC_ISLAND_POPULATION_NPC` = `live`
   - `LOGIC_ISLAND_PRESENCE_SECRET` = 你自己產生的 32 字元以上隨機字串（例如 `openssl rand -base64 48`）。**不要貼給我，也不要放進任何檔案。**
5. 重新部署這個分支的 Preview（變數是 build 時讀的）。

就算第 2 步勾錯、Production 也拿到了位址：Production 的 build 沒有 API，Key 的前綴也不同（§4.4）。

### 6.4 你同意之後我能做的與不能做的

- 建立資料庫與連接專案是建立第三方資源，要你明確同意；目前的授權我只用來唯讀（§2.2）。你同意之後，我可以用 Marketplace 的流程提出建立，但條款的同意與方案的選擇仍然需要你在畫面上確認。最單純的做法是你自己照 §6.3 做，大約五分鐘。
- 金鑰必須由你產生與輸入。
- 之後的自動驗收我可以跑：需要 Preview 的網址，以及一個 Protection Bypass for Automation 的密鑰（放在環境變數裡給腳本用，不要貼在對話中），或者你把 Preview 設成我可以存取的方式。

## 7. 測試結果

全部在隔離副本執行（不是 Preview、不是 Production、不是真機）。除另外註明外，是併入 `main` `b36c565` 之後的結果；最後一個 commit 的數字以 `docs/handoff/TESTING_STATUS.md` 為準。

| 檢查 | 結果 |
|---|---|
| Typecheck、ESLint（全專案） | 0 錯誤 |
| Vitest 全套 | **105 個檔案、2,883 通過／10 略過／0 失敗**（併入後第一次執行有 1 項失敗，即 §5 的 `presence-zones`，修正後通過） |
| 　其中 Presence 9 個檔案 291 項 | 設了本機 Redis：290 通過／1 略過（24 小時成本模擬，另外執行）；沒設：250 通過／41 略過 |
| 24 小時成本模擬（專用的 `redis-server`） | 通過；12 個情境的真 Redis 指令統計與替身的帳單逐一相同（§3.5） |
| Presence 瀏覽器測試（`PRESENCE=1`、`NPC=mock`、`REGIONAL_WORLD=1`） | **56 通過／18 略過／0 失敗**（含「關掉正在使用的分頁」與「斷線的訪客」） |
| P9 區域地圖（mock）；加上共用畫布 | 各 10／10 |
| Live 瀏覽器測試（`PRESENCE=1`、`NPC=live`） | 4／4 |
| Preview 驗收腳本，對本機 live build | **14 通過／0 失敗／1 略過**（略過的是本機沒有的 CDN）。第一次執行時「兩個分頁」那一項失敗，就是 §3.2 C 要解決的問題；加上分頁通知後通過 |
| 儲存失效檢查（本機 live build，儲存位址沒有東西在聽） | **10／10**：API 15 毫秒內回 503；桌機與手機尺寸的首頁地圖、島嶼聚焦、課程播放器、課程總覽與群島頁都正常；沒有頁面錯誤 |
| 全套 E2E，預設 build（旗標全關） | 437–438 通過，失敗 2–3 項，都不屬於本分支（§5 的表）。三次執行中兩次是 437／2，一次是 438／3 |
| 預設 build 的 route handler | 0 個；`trials:preflight --build` 的 `routes`、`bundle-leak` 通過 |
| 含 Presence 的 build，preflight 有宣告 `LOGIC_ISLAND_PRESENCE=1` | 通過（掃描 6 個檔案） |
| 同一個 build，preflight 沒有宣告 | `routes` 失敗（設計如此：沒有宣告的 Presence build 不能發布） |
| 旗標全關對 `main`（`b36c565`）逐像素，9 頁 × 桌機／手機 | **18 組 0 差異** |
| 私有題庫洩漏掃描（追蹤檔案、`origin/main..HEAD`） | clean |
| `trials-ci` | §5 |

三點說明：

- **逐像素的雜訊**：併入 `main` 之前的一次比對有兩頁出現 18–55 個像素的差異。重複 6 次後，同一頁在「`main` 對 `main`」也出現一樣的 55 個像素，所以是截圖本身的雜訊，不是 build 的差異。
- **逐像素的假警報**：有一次比對出現大片差異（群島頁 10 萬個像素）。原因是比對基準用的是「當下的 `origin/main`」，而其他工作階段剛好更新了它（PR #47），基準比分支新。把基準固定在分支併入的那個 `main` commit（`b36c565`）之後是 0 差異；之後的比對都固定基準。
- 本機的 `trials:preflight --probe` 在預設 build 上會回報 `/trials` 是 404：本機沒有設 `LOGIC_ISLAND_TRIALS=1`，與 P6 相同；CI 用自己的旗標執行，結果見 §5。

**你特別要求確認的三件事**：

| 項目 | 結論 | 依據 |
|---|---|---|
| 離線判定時間 | 有告別（關分頁、切到背景、鎖手機）：立刻不計入。沒有告別（當機、斷線）：最後一次回報後**剛好 150 秒**不再計入，不論最後一次是記錄還是脈衝；漏掉一次回報不會掉。記錄與脈衝最晚再 10 分鐘刪除 | 儲存層長時間契約（真 Redis 1 與 4 個 instance）；瀏覽器測試「a visitor who goes silent…」；驗收腳本 `count.timeout` |
| Redis 每月命令量 | 2 人 27–58 萬、10 人 132–217 萬、100 人 1,299–1,960 萬（依有沒有人看地圖、1 或 3 個 instance），比 P6 少 44–59%。Free（50 萬）約撐得住平均同時在線 1.6–3.7 人 | §3.5；`evidence/presence/p7/redis-cost.json`；脈衝收緊（§3.2 的表）與分頁通知不改變這些數字：前者不改變執行的指令，後者只在多分頁訪客離開時多一次回報 |
| 多分頁訪客在不同島嶼間切換 | 訪客始終計入一次，而且在「最後被使用的視窗」所在的島；切換、換頁、關閉視窗都立刻反映。唯一的例外是 P1-49：較新的視窗沒有告別就消失時，位置晚一點才移到還在的視窗（人數不變） | §3.4 的「多分頁跨島切換」與「多分頁一致性」；這個測試找到並修掉了第一次推送裡的一個位置錯誤（§3.2） |


## 8. 尚未解決的風險與待你決定的事

### 8.1 風險

| 編號 | 風險 | 現況 |
|---|---|---|
| R1 | **沒有對真正的 Upstash 執行過**：指令稿、脈衝、帳單、延遲、Free 用完時的實際行為 | 只對本機 Redis 與官方計費規則驗證；要在 Preview 確認 |
| R2 | ~~Vercel 的方案與函式區域未知~~ | **已解決（§2.3）**：Hobby、`iad1`。Redis 開在美國東岸，限流 1 條規則 |
| R3 | 兩個前景視窗中較新的那個沒有告別就消失時，訪客多留在它的頁面上：單一 instance 100 秒，多個 instance 最多約 13 分鐘（P1-49） | 人數不受影響；有測試固定上限。正常關閉、切換、換頁都逐步正確 |
| R4 | 斷線的訪客多留 60 秒（150 秒才消失） | 心跳間隔加倍的代價；正常離開不受影響 |
| R5 | 可以被灌水與燒額度 | 程式擋不了願意留 Cookie 的攻擊者；§4.6 的 Firewall 與 Upstash 上限都還沒設 |
| R6 | Firewall 規則是否套用在 Preview、是否計入 CDN 快取的回應，官方沒有寫 | 要在 Preview 實測 |
| R7 | 真機沒有測過；效能數字都來自這台 Mac | 與 P6 相同 |
| R8 | 人口數字最多落後約 30 秒 | 與 P6 相同（15 秒快取） |
| R9 | 隱私說明仍是草案；preflight 的例外（`144fe69`）仍待你審閱 | 與 P6 相同 |
| R10 | 資料庫被清空或 Key 被刪除時，只靠脈衝維持的訪客最多 10 分鐘不被計入 | 記錄每 10 分鐘重寫一次時自動恢復 |
| R11 | 團隊既有的 Upstash 安裝底下是否已經有資料庫，未知；免費帳號只能有 1 個 | 建立前在 Team → Storage 看一眼（§6.3 第 0 步） |
| R12 | Preview 在 Vercel Authentication 後面；Hobby 方案能不能用 Protection Bypass for Automation，這次查到的官方頁面沒有寫 | 有另一條路：Vercel 連線可以替一個部署建立**分享連結**（23 小時後失效，持有連結的人都能看那一個 Preview）。驗收腳本已支援（`SHARE`），但**還沒有對真正的 Vercel 用過**。Preview 配置好之後我會用這個方式，連結只放在執行環境裡；你不同意的話先告訴我（§10.5） |
| R13 | 超過速率上限的 Session 連告別也被拒絕，要等它那一分鐘過完才能離開；在那之前離開的話，它會被多算到逾時為止（最多 150 秒） | 從第一輪就是這樣（告別也是一次寫入，放行就等於開了一個不受限的寫入口）；這次用真的請求量到了（§10.2）。正常的頁面每分鐘 1–2 次寫入，碰不到 40 次的上限。KNOWN_ISSUES P1-51 |
| R14 | 你列的「Redis 故障降級」在真正的 Preview 上無法由我引發：要讓真的 Upstash 失效，只能改掉 Preview 的連線變數再重新部署 | 本機預演已覆蓋五種故障與恢復（§10.3）。Preview 上要不要真的做一次，是你的決定（§10.5） |

### 8.2 待你決定

| 編號 | 決定 | 我的建議 |
|---|---|---|
| Q1 | ~~是否授權我唯讀存取 Vercel 專案~~ | **已授權，盤點完成（§2.3）** |
| Q2 | 是否同意建立 Upstash Redis（Free，只接這個分支的 Preview），以及由誰操作（§6） | 同意，並由你照 §6.3 操作（約五分鐘） |
| Q3 | 心跳 60 秒／逾時 150 秒是否接受；要不要再放寬（120／300 秒），或把人口快取改為 30 秒 | 接受 60／150；其餘等 Preview 有真實數字再說 |
| Q4 | Firewall 限流規則（§4.6）何時設、用哪一組數字 | Preview 驗收時設並實測；數字先用表中的 |
| Q5 | P6 留下的：規劃中島嶼的訪客畫在橋上或完全不畫；隱私說明文字；preflight 例外的審閱 | 沒有變動，見 P6 文件 §9.2 |
| Q6 | PR 何時從 Draft 轉為可審閱；合併 `main` | Preview 驗收通過之後；合併是另一個決定 |

### 8.3 是否達到 Preview Launch Gate

**程式這一側：達到。** 逐項：

| 條件 | 狀況 |
|---|---|
| CI 全綠 | `trials-ci` 在 PR 上通過（§5） |
| 沒有新的回歸 | 本機全套通過；預設 build 的失敗都在 `main` 自己的 build 上重現或與負載相關（§5、§7） |
| Production 不受影響 | 預設 build 0 個 handler；與 `main` 逐像素 0 差異；正式網站的 API 回 404 |
| P1-44 沒有被破壞 | P6-A 的測試未修改且通過；新增脈衝路徑的測試 |
| 成本 | 比 P6 少 44–59%，Free 足夠 Preview 驗收 |
| 失效時不影響網站 | 已驗證（§4.5） |
| 私有題庫 | clean |

**2026-11-22 追加**：八個驗收項目已在本機預演全部通過（§10），所以剩下的風險集中在「真正的 Vercel 與 Upstash 和本機不一樣的地方」（R1、R6、R12）。

**還不能在 Preview 上驗收，因為還有兩件事需要你**（都不是程式問題）：

1. ~~Vercel 的唯讀授權~~：已完成（§2.3）。
2. 同意並建立 Upstash Redis（Free，只接這個分支的 Preview），加上三個 Preview 環境變數（§6）。
3. 讓驗收腳本與手機進得去 Preview（Protection Bypass 密鑰或已登入的瀏覽器）。

完成之後才是真正的 Preview 驗收：真正的 Upstash、多個 instance、CDN、真機。那一步通過之前，我不建議把 PR 從 Draft 轉為可審閱。

## 9. 重現

```bash
# 單元測試（含真 Redis；伺服器只給測試用）
redis-server --port 6391 --bind 127.0.0.1 --save '' --appendonly no
PRESENCE_TEST_REDIS_URL=redis://127.0.0.1:6391 pnpm exec vitest run tests/presence-engine.test.ts tests/presence-redis-store.test.ts

# 成本（另一個專用的 Redis，約兩分鐘）
redis-server --port 6392 --bind 127.0.0.1 --save '' --appendonly no
PRESENCE_COST_REDIS_URL=redis://127.0.0.1:6392 PRESENCE_COST_OUT=/tmp/redis-cost.json pnpm exec vitest run tests/presence-redis-cost.test.ts

# 儲存失效（本機 live build；位址指向沒有東西在聽的埠）
LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=live pnpm exec next build
KV_REST_API_URL=https://127.0.0.1:9 KV_REST_API_TOKEN=unused LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=live pnpm exec next start --hostname 127.0.0.1 --port 3154
ROOT=$PWD BASE=http://127.0.0.1:3154 node docs/planning/evidence/presence/tools/store-outage-check.mjs
```

本機 Preview 預演（§10；三個 instance、一個共用 Redis、可注入故障）：

```bash
LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=live pnpm exec next build
ROOT=$PWD WORK=<空的暫存目錄> node docs/planning/evidence/presence/tools/local-preview-stack.mjs   # 印出 READY 後保持執行
ROOT=$PWD BASE=http://127.0.0.1:3156 EXPECT_STORE=shared node docs/planning/evidence/presence/tools/preview-validate.mjs
ROOT=$PWD BASE=http://127.0.0.1:3156 CONTROL=http://127.0.0.1:3159 node docs/planning/evidence/presence/tools/store-flap-check.mjs
```

依專案慣例，這些都應該在隔離的副本裡執行（build 會寫 `.next`）。

## 10. 本機 Preview 預演與 Preview 驗收計畫（2026-11-22）

你要求在 Redis 與 Preview 變數準備好之前，先完成所有不依賴真實 Preview Redis 的驗證。先前的本機驗證有一個缺口：驗收腳本只對「一個伺服器、記憶體儲存」跑過，多 instance 的一致性只在儲存層的測試裡驗過，沒有經過真的 HTTP、真的瀏覽器與 REST 連線。這一輪把它補上。

### 10.1 預演環境

工具：[`evidence/presence/tools/local-preview-stack.mjs`](evidence/presence/tools/local-preview-stack.mjs)。它在本機啟動：

| 元件 | 說明 |
|---|---|
| 一個專用的 `redis-server` | 不寫入磁碟，結束時關掉 |
| Upstash REST API 的替身（https） | 接受應用程式送出的指令並轉給那個 Redis；和 Marketplace 整合一樣以 `KV_REST_API_URL`／`KV_REST_API_TOKEN` 提供給應用程式 |
| 三個 `next start` 行程 | 同一個 Presence build，`VERCEL_ENV=preview`，所以 Key 是 `li:presence:preview:sessions` |
| 一個輪流分派的入口 | 每個請求交給下一個 instance（實測三個各得三分之一：282／283／282） |
| 控制位址 | 讓儲存「斷線、變慢、回 500、額度用完」，以及讀取 Redis 實際執行的指令數 |

Token 與 Session 金鑰在啟動時隨機產生，只存在行程的記憶體裡，不印出、不寫檔。應用程式只接受 https 的儲存位址，這一點沒有為了預演放寬：工具自己簽一張只給 `127.0.0.1` 的憑證，以 `NODE_EXTRA_CA_CERTS` 交給那三個行程，系統的信任清單沒有動。

**它不是什麼**：不是 Vercel 的 CDN、Firewall 與區域，也不是 Upstash 本身。它驗的是「本系統在多個 instance、共用一個 Redis、經過 REST 連線時的行為」。Upstash 實際的延遲、計費與額度用完時的回應，仍然要在真正的 Preview 上確認（R1）。

### 10.2 你列的八個項目

驗收腳本 `preview-validate.mjs` 新增了 D 部分（`timing.*`、`order.*`、`rate.*`、`count.crowd`），同一支腳本之後直接對 Preview 執行。

| 你列的項目 | 用什麼驗 | 本機預演（三個 instance） | Preview 上 |
|---|---|---|---|
| Redis 多 Instance 一致性 | `api.store` 是 `shared`；所有計數檢查的請求輪流落在三個 instance；`store.agreement` 同時 24 個請求只有一種答案 | **通過** | 同一支腳本；Vercel 開幾個 instance 不由我們決定，`store.agreement` 用並行請求逼出多個 |
| 心跳與 TTL | `timing.reported`（伺服器要求 60 秒後回報、逾時 150 秒）；`count.crowd` 觀察真的頁面兩分鐘（兩次回報相隔 60 秒）；`count.timeout`（斷網的訪客先留著，150 秒加延遲之內消失） | **通過** | 同上 |
| 多人在線計數 | `count.visitor`、`count.two-tabs`、`count.region`、`count.planned-island`、`count.crowd`（六位訪客在四座島、一個群島頁與首頁，靜置兩分鐘，一位換島，全部離開） | **通過** | 同上 |
| 亂序與重複請求 | `order.repeated-and-late`：不經頁面直接送請求。同一個回報重複四次、被超車的舊回報、過時的告別都不改變計數；告別後才到的舊回報不會把訪客帶回來；更新的回報才會 | **通過** | 同上 |
| API Rate Limiting | `rate.session`：一個 Session 連送 50 次，正好 40 次被接受、10 次回 429 並帶 `Retry-After`，另一個 Session 不受影響。`rate.platform`：Vercel Firewall 的規則 | 程式這一層**通過**；Firewall 本機沒有 | `rate.session` 照跑。`rate.platform` 要先有 Firewall 規則（那是專案層級的設定，也會套用在 Production，所以是你的決定，§10.5） |
| Redis 故障降級 | `store-outage-check.mjs`（儲存一開始就不通）與新的 `store-flap-check.mjs`（訪客在線時儲存壞掉再恢復，§10.3） | **10／10 與 8／8** | 無法由我引發（R14） |
| Desktop／Mobile E2E | `count.crowd` 裡兩位是手機尺寸與手機 User-Agent，並檢查手機首頁地圖的人影數；`e2e/presence.spec.ts` 的桌機與手機專案；儲存失效檢查的桌機與手機頁面 | **通過**（E2E 56／56，§10.4） | 腳本的手機是模擬的；真機是人工清單（PRESENCE_PREVIEW_VALIDATION.md §5.3） |
| Leak Scan | `trials:leak-scan`（追蹤檔案）；release preflight 的 `bundle-leak`（build 產物） | **clean** | Preview 的 build 產物由 CI 的 preflight 把關；我會再對驗收當時的 commit 掃一次 |

完整一次驗收腳本的結果：**18 通過／0 失敗／2 略過**（略過的是 CDN 與 Firewall，本機都沒有）。記錄在 [`evidence/presence/p7/rehearsal-preview-validate.json`](evidence/presence/p7/rehearsal-preview-validate.json)。

**一次完整驗收花多少 Redis 命令**：514 個（Redis 實際執行的指令數，等於 Upstash 的計費方式），加上故障注入共 565 個。相對於 Free 的每月 50 萬可以忽略。記錄在 [`rehearsal-store-usage.json`](evidence/presence/p7/rehearsal-store-usage.json)。

過程中有三次失敗，都是我新寫的檢查本身的問題，不是系統的：

| 失敗 | 原因 | 處理 |
|---|---|---|
| `rate.session` 等不到那個 Session 離開 | 檢查假設「超過上限的 Session 仍然可以告別」。實際上告別也算一次寫入，會被拒絕，從第一輪就是這樣設計 | 檢查改為驗證真正的行為：告別被拒絕、訪客仍被計入；那一分鐘過完之後才能離開。這個特性記為 R13／P1-51 |
| `count.crowd` 的數字對不上 | 兩個原因：首頁的訪客算在 `commons.hub`，我的預期漏了；比較時把物件的鍵順序也算進去 | 修正預期；比較改為不看鍵的順序 |
| 重跑時起始數字錯 | 三個 instance 各自保留最多 15 秒的人口數字，腳本開始時讀到的基準剛好是一個即將過期的舊數字 | 腳本現在會等所有答案連續 20 秒一致才開始，而且檢查失敗時也讓訪客告別，不留給下一次執行。這個問題在單一 instance 上不會出現，是這次預演才看得到的 |

第三項值得記住：**對 Preview 執行時，起始基準一樣會遇到 instance 的快取**，所以這個修正不只是為了本機。

### 10.3 儲存壞掉再恢復

`store-flap-check.mjs`：兩個 Session 與一個真的頁面在線，然後依序讓儲存以四種方式失效，最後恢復。

| 情境 | 結果 |
|---|---|
| 儲存直接斷線 | 回報立刻回 503（9 毫秒）；每個 instance 的人口回應在自己那份數字過期後（15 秒內）也回 503；開著的頁面自己的回報也被拒絕 |
| 儲存 6 秒才回應 | 3 秒逾時後回 503（回報 3,009 毫秒、人口 3,008 毫秒），函式不會被拖住 |
| 儲存回 500 | 503，10 毫秒 |
| 方案的命令額度用完（Upstash 的錯誤訊息） | 503，9 毫秒；回應裡沒有額度、用量或服務名稱 |
| 以上四種的共同點 | 回應都是 `{"ok":false,"error":"unavailable"}`、`no-store`、帶 `Retry-After`；看不出是哪一種故障 |
| 故障期間的網站 | 課程頁照常載入，沒有頁面錯誤；另外 `store-outage-check.mjs` 在三個 instance 上 10／10（桌機與手機的地圖、島嶼聚焦、課程播放器、各頁面） |
| 恢復 | Session 馬上再被計入；那個一直開著、沒有人重新整理的頁面在 53 秒後自己再次回報成功（被拒絕時伺服器要它等 60 秒） |

「額度用完」這一項用的是 Upstash 文件上的錯誤訊息格式，由替身回覆；真正的 Upstash 在額度用完時回什麼狀態碼，仍然要以實際為準。本系統對任何非成功的回應都一樣處理，所以結果不會因此不同。

### 10.4 併入最新 `main`（`f18aafa`）之後的全套結果

`main` 在這段期間又前進了 47 個 commit（PR #48–#58）。併入沒有衝突，也沒有兩邊都改的檔案。以下全部在隔離副本執行。

| 檢查 | 結果 |
|---|---|
| Typecheck | 0 錯誤 |
| ESLint | 0 錯誤、1 個警告（`src/components/curriculum/lesson-page.tsx` 有一個沒用到的 import，是 `main` 帶進來的，不是本分支的檔案） |
| Vitest 全套（含真 Redis） | **111 個檔案、3,258 通過／10 略過／0 失敗** |
| 預設 build（旗標全關） | 0 個 route handler；preflight `--build` 通過（`bundle-leak` 掃 1,393 個檔案） |
| 全套 E2E，預設 build | **439 通過／2 失敗／367 略過**。失敗的兩項是 `candidate-integration.spec.ts:179`、`:264`，`main` 既有的 P1-43，與先前相同 |
| 旗標全關對 `main`（`f18aafa`）逐像素 | **18 組 0 差異** |
| Presence build 的 preflight | 有宣告：通過（177 個路由，handler 掃 6 個檔案）；沒宣告：`routes` 失敗（設計如此） |
| Presence 瀏覽器測試（桌機＋手機專案） | **56 通過／18 略過／0 失敗** |
| P9 區域地圖（mock）；加上共用畫布 | 各 10／10 |
| Live 瀏覽器測試 | 4／4 |
| 驗收腳本，單一 instance、記憶體儲存 | 18 通過／0 失敗／2 略過 |
| 儲存失效檢查，單一 instance | 10／10 |
| 驗收腳本，三個 instance、共用 Redis | **18 通過／0 失敗／2 略過** |
| 儲存故障注入，三個 instance | **8／8**；儲存失效檢查 10／10 |
| 私有題庫洩漏掃描（追蹤檔案） | clean |

本機 preflight 的 `--probe` 一樣回報 `/trials` 是 404（本機沒有設 `LOGIC_ISLAND_TRIALS=1`，與先前相同；CI 用自己的旗標執行）。

### 10.5 Preview 配置好之後我會做的，以及仍然需要你的

Preview 的 Redis 與三個變數就緒後（§6.3），我會自己執行，不再逐項詢問：

1. 讀取該分支最新的 Preview 部署，確認 `/api/presence` 回 200、`x-presence-store` 是 `shared`、函式在 `iad1`。
2. 取得存取：替**那一個 Preview 部署**建立分享連結（23 小時後失效）。連結只放在執行環境的變數裡，不寫進檔案、不貼在對話中。這會是我第一次對 Vercel 做唯讀以外的事，範圍只有這個 Preview 部署；**你不希望我這樣做的話，請在配置完成時一併告訴我**，改由你提供 Protection Bypass 密鑰或在已登入的瀏覽器執行。
3. 對 Preview 執行完整的 `preview-validate.mjs`（含 `api.cdn`），記錄結果與當時 Upstash 的用量。
4. 對驗收當時的 commit 再跑洩漏掃描，確認 `trials-ci`。
5. 全部通過後，整理 PR #44 的正式發布準備報告。PR 維持 Draft。

不會做的：不改 Production、不開正式 Presence、不改函式區域、不把任何金鑰寫進 repository、不合併。

仍然需要你決定或動手的：

| 項目 | 為什麼需要你 |
|---|---|
| Upstash 資料庫：先確認既有的，再決定建立（§2.4、§6.3） | 建立第三方資源；而且方案清單裡沒有看到 Free，可能涉及費用 |
| 三個 Preview 變數與重新部署 | 修改環境變數；金鑰必須由你產生 |
| Vercel Firewall 的限流規則（要驗 `rate.platform` 才需要） | 專案層級的設定，會同時套用在 Production 的網址上；Hobby 只有 1 條 |
| 要不要在 Preview 上真的引發一次 Redis 故障 | 得把 Preview 的連線變數改壞再重新部署，之後改回來 |
| 真機驗收（iPhone、Android） | 需要實體裝置 |
| 正式發布的決定 | 轉為可審閱、合併 `main`、開啟 Production Presence |
