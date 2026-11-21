# Presence：Preview 驗收方案（P6-E）

> 日期：2026-11-21 ｜ 分支：`presence/visitor-population` ｜ 狀態：**方案與工具已備妥，尚未執行**。執行前需要使用者完成 §3 的人工步驟（其中兩項會建立雲端資源或修改環境變數，我沒有做）。
>
> 範圍只到 Vercel **Preview**。本文件的任何步驟都不部署、不修改 Production。

## 1. 要驗什麼

本機已經驗過的是「程式的行為」。Preview 要驗的是本機驗不到的四件事：

1. **真正的 Upstash**：REST 端點是否接受我們的兩支指令稿與三個一般指令，帳單上的指令數是否與量測相同，延遲多少。
2. **多個 instance 共用一份資料**：計數不因請求落在哪個 instance 而不同。
3. **CDN**：人口數字確實被快取 15 秒，且沒有把任何個人化的東西快取進去。
4. **真機**：桌機與手機瀏覽器上的動畫、耗電與發熱。

## 2. Preview 與 Production 怎麼隔開

| 層 | 隔離方式 | 誰負責 |
|---|---|---|
| 程式是否存在 | Presence API 只存在於以 `LOGIC_ISLAND_PRESENCE=1` 建置的 build。環境變數只設在 Preview（可再限定到這個分支），Production 的 build 裡沒有這條 route（2026-11-21 實測 Production 的 `/api/presence` 回 404） | 環境變數的範圍（使用者設定） |
| NPC 假資料 | `LOGIC_ISLAND_POPULATION_NPC=mock` 在 Production 一律無效（`flag.ts`，有測試），就算誤設也不會出現 | 程式 |
| 簽章金鑰 | Preview 與 Production 各用各的 `LOGIC_ISLAND_PRESENCE_SECRET`。Vercel 上（Preview 與 Production）沒設就回 503，不會用臨時金鑰矇混 | 程式＋使用者 |
| 儲存 | Redis 的 Key 帶環境名稱（`li:presence:preview:sessions`／`li:presence:production:sessions`）。即使同一個資料庫日後也接上 Production，兩邊的訪客不會互相計入 | 程式 |
| 儲存的連線 | 建議這個資料庫只接到 Preview 環境。Production 沒有連線變數時 API 回 503 `unconfigured` | 使用者（Marketplace 的環境勾選） |
| 存取 | 這個專案的 Preview 部署在 Vercel Authentication 後面（未登入會被導向 SSO），外人進不來 | Vercel 專案設定（現狀） |
| 部署 | Production 只在 `main` 有新 commit 時部署。本分支沒有合併，推送只會產生 Preview | Git |

**Preview 之間不隔離**：同一個專案的所有 Preview 部署共用 `preview` 這個前綴。同時驗兩個分支時，兩邊的訪客會算在一起。

## 3. 需要的人工步驟（最少的一組）

依序做。①、② 會建立資源或改環境變數，所以必須由使用者動手或明確授權。

| # | 步驟 | 為什麼要人來做 |
|---|---|---|
| ① | 在 Vercel Marketplace 為專案建立 **Upstash Redis**（Free 方案；區域選與函式相同的區域，新專案預設是 `iad1`），**只勾 Preview 環境** | 建立第三方帳號與資源 |
| ② | 在專案的環境變數新增三個，**範圍只選 Preview**（可再限定分支 `presence/visitor-population`）：`LOGIC_ISLAND_PRESENCE` = `1`；`LOGIC_ISLAND_POPULATION_NPC` = `live`；`LOGIC_ISLAND_PRESENCE_SECRET` = 32 個字元以上的隨機字串（標為 Sensitive） | 修改環境變數；金鑰不該經過我 |
| ③ | 重新部署這個分支的 Preview（Deployments → 該部署 → Redeploy，或推一個 commit） | 環境變數在建置時才生效 |
| ④ | 讓驗收腳本進得去：在 Project Settings → Deployment Protection 建立「Protection Bypass for Automation」的密鑰，執行腳本時以環境變數 `BYPASS` 傳入。或者由你在已登入 Vercel 的瀏覽器手動走 §5 的清單 | Preview 在 SSO 後面；上一輪的 A1-P 驗收就卡在這裡 |
| ⑤ | 手機驗收：在手機瀏覽器登入 Vercel 後開 Preview 網址，或在 Vercel 產生一條 Shareable Link | 同上 |

產生金鑰的方式（在自己的終端機執行，把輸出貼進 Vercel；不要貼給我）：

```bash
openssl rand -base64 48
```

可選：授權我唯讀存取 Vercel 專案（我會給一條 10 分鐘內有效的同意連結）。有了之後我可以自己確認 ①–③ 的結果（只讀變數名稱，不讀值）、讀部署與函式的記錄。

第二輪想看區域地圖上的 NPC 時，再加 `LOGIC_ISLAND_REGIONAL_WORLD` = `1`（Preview）。想先看假資料的動畫而不接儲存時，把 `LOGIC_ISLAND_POPULATION_NPC` 設為 `mock` 即可（不需要 ①，但仍需要 ② 的金鑰）。

## 4. 自動驗收

工具：[`evidence/presence/tools/preview-validate.mjs`](evidence/presence/tools/preview-validate.mjs)。它用真的瀏覽器從外面檢查一個已部署的 build，會拒絕對 Production 網域執行。

```bash
ROOT="$PWD" BASE="https://<preview 網址>" BYPASS="<步驟 ④ 的密鑰>" OUT=/tmp/preview-validate.json node docs/planning/evidence/presence/tools/preview-validate.mjs
```

| 檢查 | 內容 | 對應的驗收項目 |
|---|---|---|
| `api.get` | 回 200、欄位正好八個、`Cache-Control` 15 秒、不設 Cookie、不開放跨來源。404／503 時直接說明少了哪個設定 | Presence Tracking |
| `api.store` | 回應標頭 `x-presence-store` 是 `shared`。是 `memory` 就代表儲存沒接上 | Redis Shared Store |
| `api.cdn` | 連續兩次 GET，第二次是 CDN 命中（`x-vercel-cache: HIT`） | 快取 |
| `api.refusals` | 跨來源 POST 回 403、其他方法 405、`/api` 底下沒有別的東西 | 安全 |
| `count.visitor` | 一位訪客開基礎程式島：總數 +1、該島 +1；Cookie 的屬性；人口數字裡沒有 Session 的任何片段 | Presence Tracking |
| `count.two-tabs` | 同一個瀏覽器開第二個分頁到另一座島：仍然只算一人，跟著正在用的分頁走 | 多分頁 |
| `count.region` | 第二位訪客開 AI 群島的頁面：總數 +2，算在 AI 的公共區域 | 多訪客、Region 聚合 |
| `count.planned-island` | 同一位訪客看規劃中的島：仍在 AI 的公共區域，該島沒有自己的數字 | Island 聚合（P6-B） |
| `count.privacy-signal` | 帶 Global Privacy Control 的瀏覽器：不計入、沒有 Cookie | 隱私 |
| `store.agreement` | 靜置 20 秒後同時送 24 個請求：所有回應的計數相同 | Redis Shared Store（多 instance） |
| `npc.source`、`npc.live` | 首頁地圖有 NPC 圖層；第一位訪客在基礎程式島時，另一位訪客的地圖上該島正好一個人影 | NPC Live |
| `count.goodbye` | 第一位訪客關掉頁面：計數歸零，人影離開 | 告別 |
| `count.timeout` | 第二位訪客斷網：90 秒內仍計入，之後消失（約兩分半；`SKIP_TTL=1` 可略過） | 過期 |
| `count.clean` | 結束時人口回到開始時的數字 | 清理 |

- 計數都以「與開始時的差」判斷，並且每一項都等到成立為止（人口數字在 CDN 最多舊 15 秒、在 instance 再 15 秒），所以 Preview 上有少數其他訪客也不會誤判；最好在沒有別人使用時執行。
- **這支腳本已在本機的 live build 上跑過**（`EXPECT_STORE=memory`），結果見 [PRESENCE_P6_PRODUCTION_READINESS.md](PRESENCE_P6_PRODUCTION_READINESS.md) §8。本機驗不到的是 `api.store` 為 `shared`、`api.cdn` 與 `store.agreement` 在多 instance 下的意義。
- NPC 假資料的 build（`mock`）用 `EXPECT_NPC=mock`；沒有 NPC 的 build 用 `EXPECT_NPC=off`。

既有的瀏覽器測試（`e2e/presence.spec.ts`）**不適合直接對 Preview 跑**：它假設計數立即可見（本機沒有 CDN，也沒有 instance 快取），在 Preview 上會因為 15＋15 秒的延遲而誤報。

## 5. 人工驗收清單

自動腳本驗不到的部分。每一項記錄：裝置、瀏覽器、結果、截圖或錄影。

### 5.1 Upstash 與成本（需要 Upstash 主控台）

| # | 項目 | 通過條件 |
|---|---|---|
| U1 | 跑完 §4 之後看 Upstash 的 Data Browser | 只有一個 Key `li:presence:preview:sessions`；腳本結束 10–15 分鐘後裡面只剩 `~swept`、`~renewed` 兩個欄位 |
| U2 | 開一個分頁停在課程頁 10 分鐘，記下前後的 Daily Commands | 增加量約 60–90 個（20 次心跳 × 3–4，加上一次清理）。和 [PRESENCE_SHARED_STORE.md](PRESENCE_SHARED_STORE.md) §4.4 差很多就要查 |
| U3 | 看 Upstash 的延遲圖表 | 與函式同區域時 P50 應為個位數毫秒；記下實際數字 |
| U4 | 24 小時後看 Key 是否消失 | 沒有任何訪客時，Key 在最後一次續期後 24 小時內自動消失 |

### 5.2 桌機

| # | 項目 | 通過條件 |
|---|---|---|
| D1 | 兩個瀏覽器（或一般＋無痕視窗）分別開課程頁與首頁地圖 | 地圖上對應的島在一分鐘內出現一個人影；關掉課程頁後一分鐘內消失 |
| D2 | 同一個瀏覽器開三個分頁到三座島 | 地圖上只有一個人影，在最後使用的分頁所在的島 |
| D3 | 兩個視窗並排，同時最小化 | 兩分鐘後地圖上沒有殘留的人影（P1-44） |
| D4 | 開 AI 群島的頁面、再點一座規劃中的島 | 首頁地圖沒有變化（AI 不在首頁地圖上）；`/api/presence` 的 `commons.ai` 為 1，`islands` 沒有那座島 |
| D5 | 開發者工具 → Application | Cookie 只有 `li_presence`（HttpOnly、Strict、Path `/api/presence`）；Local／Session Storage 沒有識別碼 |
| D6 | 開發者工具 → Network，停在首頁 5 分鐘 | 每 30 秒一個 POST、每 15 秒一個 GET；分頁切到背景後兩者都停 |
| D7 | 開著首頁地圖，看工作管理員的 CPU | 沒有人影在動時接近閒置；有人影時明顯低於旋轉地圖時 |

### 5.3 手機（真機，至少一支 iPhone 與一支 Android）

| # | 項目 | 通過條件 |
|---|---|---|
| M1 | 開首頁地圖，另一台裝置開課程頁 | 人影出現、走在路上，沒有走進海裡或穿過建築 |
| M2 | 放著不動 45 秒 | 動畫自己停下來（省電）；碰一下螢幕後繼續 |
| M3 | 切到別的 App 再回來 | 回來後人影位置合理，沒有瞬間移動或卡住 |
| M4 | 開著地圖 10 分鐘，記錄電量與機身溫度 | 與同一頁面「NPC 關閉」的 Preview 相比，耗電差距在可接受範圍（由你判斷）；沒有明顯發燙 |
| M5 | 系統設定開啟「減少動態效果」 | 人影直接站在位置上，不走動 |
| M6 | 操作地圖（拖曳、縮放、點島） | 與沒有 NPC 時一樣順，點得到島 |

### 5.4 效能數字（桌機，可重現）

FPS、CPU 與 draw call 用第二輪的工具量。它需要假資料的 build（`LOGIC_ISLAND_POPULATION_NPC=mock`）：

```bash
ROOT="$PWD" BASE="https://<preview 網址>" PERF_GPU=metal node docs/planning/evidence/presence/tools/npc-loop-perf.mjs
```

記憶體：Chrome 開發者工具 → Memory，開著地圖 10 分鐘前後各拍一次 Heap snapshot，確認沒有持續成長。耗電：Safari 的「網頁檢閱器 → 時間列 → 能源」，或 macOS 活動監視器的「能耗影響」。這三項沒有自動化。

## 6. 驗完之後

- 把 `OUT` 的 JSON 與 §5 的記錄放進 `docs/planning/evidence/presence/p6/`。
- 不留著的話：刪掉 Preview 的三個環境變數並重新部署，Presence 就從 Preview 消失；Upstash 的資料一天內自己清空，資料庫可在 Marketplace 移除。
- **進 Production 是另一個決定**，需要另外做：Production 範圍的環境變數與金鑰、資料庫接到 Production、Firewall 限流、隱私說明上線，以及合併 `main`。這些都不在本方案內。
