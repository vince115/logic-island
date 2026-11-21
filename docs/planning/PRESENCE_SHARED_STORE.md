# Presence 共用儲存評估（P4）

> 日期：2026-11-21（P4）；2026-11-21 P6-C 改寫 §4、§5 ｜ 分支：`presence/visitor-population` ｜ 狀態：**設計與測試完成；沒有建立任何雲端資源，沒有修改任何環境變數**
>
> **P6-C 更正**：P4 版的 §5 以「一次 `EVAL` 算一個指令」估算費用。Upstash 的計費規則是「指令稿算一個，指令稿裡每執行一個指令再各算一個」，所以 P4 的數字低估了約 4 倍。§4 的資料結構已為此改寫（每次心跳的計費指令由 6–8 個降為 3–4 個），§5 改為實測值。
>
> 主文件：[PRESENCE_POPULATION_SYSTEM.md](PRESENCE_POPULATION_SYSTEM.md)。本文件回答「Presence 上 Vercel 正式環境要用什麼儲存」，並記錄已實作、已測試的 `RedisPresenceStore`。

## 1. 結論

**建議：Upstash Redis，經 Vercel Marketplace 佈建（`upstash/upstash-kv`），先用 Free 方案，單一區域。**

- 它是唯一同時滿足「HTTP 存取（不需連線池）、指令稿原子更新、免費起步、Marketplace 自動注入環境變數」的選項。
- 程式已經寫好並測過：[`src/lib/presence/redis-store.ts`](../../src/lib/presence/redis-store.ts)。它只用 `EVAL` 與三個一般指令（`HGET`、`HGETALL`、`HLEN`），不需要新增任何 npm 套件，也不綁定 Upstash（任何 Redis 相容服務只要一個幾行的 adapter）。
- **Free 方案的容量有限**（§5）：每月 50 萬個指令大約是「平均同時在線 1.5 人」。超過之後，隨用隨付在 10 人時每月約 US$6–9；再多就改用固定月費 US$10 的方案（不計指令數）。
- 要不要佈建、用哪個方案、放哪個區域，都是使用者的決定（§7）。

## 2. 現況盤點

### 2.1 Vercel 部署環境

| 項目 | 現況 | 來源 |
|---|---|---|
| 專案 | `vince115s-projects/logic-island`，Git 連結 `vince115/logic-island`，`main` 自動部署 Production | 交接記錄 |
| 設定檔 | repo 內沒有 `vercel.json`／`vercel.ts`；`next.config.ts` 只有 Presence 的條件式 `pageExtensions` | repo |
| 現有函式 | **沒有**。所有頁面都是靜態預先產生；Presence API 會是專案第一個 Vercel Function | build 輸出 |
| 現有儲存／整合 | repo 內沒有任何儲存用的環境變數名稱或 SDK | repo |
| 方案、函式區域、Fluid Compute 設定、已安裝的 Marketplace 整合 | **讀不到**。Vercel MCP 連線與本機 `vercel` CLI 都沒有 `vince115s-projects` 的授權（CLI 登入的是另一個帳號） | 2026-11-21 實測 |

最後一列需要使用者在 Vercel 後台確認，或授權後由我讀取（唯讀）。函式區域會決定 Redis 該放哪一區。

### 2.2 `PresenceStore` 介面

```ts
interface PresenceStore {
  touch(sid: string, beat: Heartbeat, now: number): Promise<'counted' | 'rate-limited' | 'full'>;
  leave(sid: string, leave: Leave | string, now: number): Promise<void>;
  counts(now: number): Promise<PopulationCounts>;
}
```

- 三個都是「整體操作」：呼叫端不會先讀再寫，所以儲存層可以自己決定怎麼做到原子性。
- 所有判斷（誰擁有 Session、是否過期、限流）都在 `engine.ts` 的純函式裡。共用儲存**不重寫規則**，只負責保存記錄與讓寫入原子化。
- 記憶體版 `MemoryPresenceStore` 只在單一行程內正確。Vercel 會同時跑多個 instance、也會重啟，所以每個 instance 只會數到自己的訪客。

## 3. 選項比較

價格是 2026-11-21 查到的公開資訊，**以各家定價頁為準**；標「未確認」的是我沒有查到可靠來源的項目。

| | Upstash Redis | Redis Cloud（Marketplace `redis`） | Postgres（Neon／Supabase／Prisma Postgres） | Amazon DynamoDB（Marketplace） |
|---|---|---|---|---|
| 存取方式 | HTTPS REST，無連線 | TCP（RESP），需要用戶端套件與連線管理 | HTTP driver 或連線池 | HTTPS，需要 AWS SDK |
| 原子更新 | Lua `EVAL`（REST 支援） | Lua `EVAL` | `INSERT … ON CONFLICT`／條件式 `UPDATE` | 條件式寫入 |
| 一致性 | 單區域強一致；全球複寫的讀取為最終一致 | 同左 | 強一致（單一主節點） | 寫入強一致；讀取可選 |
| TTL | Key 層級；本設計以記錄開頭的時間判定過期（毫秒精確） | 同左 | 沒有；查詢時過濾＋定期 `DELETE` | 有，但刪除是延遲的，查詢仍須過濾 |
| 延遲 | 同區域通常為個位數到十幾毫秒（**本輪未量測**） | 同區域最低，但冷啟動要建連線 | 查詢本身快；閒置後喚醒較慢 | 個位數毫秒 |
| 免費額度 | 250 MB、每月 50 萬指令、10 GB 流量、1 個資料庫 | 30 MB 資料庫 | 各家有免費方案；心跳會讓運算無法休眠 | 有常設免費額度（細節未確認） |
| 計費 | 隨用隨付每 10 萬指令 US$0.20（指令稿內的指令另計，§5）；或固定月費（US$10 起、不計指令數） | 月費制（細節未確認） | 運算時數＋儲存 | 依讀寫請求數（現行單價未確認） |
| 需要新增的套件 | **無**（`fetch`） | `redis` 或 `ioredis` | driver | `@aws-sdk/*` |
| 本專案的實作狀態 | **已實作、已測試** | 換一個 adapter 即可沿用同一個 Store | 需另寫 Store | 需另寫 Store |

### 不適合的選項

| 選項 | 為什麼不行 |
|---|---|
| 記憶體（現狀） | 多 instance 各算各的；重啟歸零 |
| Vercel Runtime Cache | 是「區域內的快取」，不是資料庫：沒有原子更新，資料隨時可能被清掉，不同區域互相看不到 |
| Global Config（原 Edge Config） | 為「讀多寫少的設定」設計，不適合每 30 秒一次的寫入 |
| Vercel Blob | 物件儲存，沒有原子的讀改寫 |
| Convex、Turso | 做得到，但要引入一整套後端或資料庫，只為了一個計數器不划算 |

### 為什麼不是 Postgres

Presence 的資料活不過 90 秒，又是每位訪客每 30 秒寫一次。Postgres 的強項（關聯、持久、查詢）用不到，弱點（免費方案靠「閒置休眠」省錢，但心跳會讓它永遠醒著）正好被踩到。如果專案之後因為別的功能（帳號、學習進度）有了 Postgres，可以再評估合併。

## 4. 設計：`RedisPresenceStore`

### 4.1 資料

每個環境一個 Key（`<環境>` 是 Vercel 的 `production`／`preview`／`development`，本機為 `local`）：

| Key | 型別 | 內容 |
|---|---|---|
| `li:presence:<環境>:sessions` | HASH | Session ID → `<最後心跳的伺服器時間>:<記錄的 JSON>`（記錄即 `SessionRecord`） |
| 同一個 HASH 的 `~swept`、`~renewed` 兩個欄位 | | 上次清理、上次續期的時間。Session ID 是 base64url，不會以 `~` 開頭 |

- 存的東西和記憶體版完全一樣：隨機 Session ID、位置、幾個時間戳、分頁的隨機標籤與各分頁離開的時間（最多 6 筆）、限流計數。**沒有 IP、User-Agent 或任何可辨識個人的資料。**
- 值的開頭重複一次 `seen`，是為了讓 Lua 不必解析 JSON 就能判斷過期。
- **Key 帶環境名稱**（P6-E）：就算同一個資料庫同時接了 Preview 與 Production，兩邊的訪客也不會混在一起計數。
- P4 版用的是一個 HASH 加一個 ZSET；改成單一 HASH 是為了少執行指令（§4.4）。兩種結構沒有相容問題：共用儲存從未佈建過。

### 4.2 原子更新：比較後才寫入

寫入是一支 Lua 指令稿（`WRITE_SCRIPT`）：「只有當記錄仍是我做決定時看到的那一筆，才換成新的；否則把現在的記錄還給我」。收到衝突就用新的記錄重新跑一次 `engine.ts` 的判斷。

- 規則只有一份（TypeScript 的 engine），Lua 不含任何業務邏輯。
- 兩個 instance 同時處理同一個 Session 的兩個分頁，結果一定等於「某一種先後順序」的結果，不會是混合狀態；限流計數也不會漏算。
- 同一個 instance 內，同一個 Session 的寫入會排隊，所以只有「別的 instance」才會造成衝突。一次寫入最多嘗試 10 次，足以承受同一個 Session 同時有 9 個別處的寫入；超過就回 503，追蹤器稍後重試。
- instance 會記得自己上次寫的記錄，直接拿來比較（省一次讀取）。如果這份記憶錯的比對的多（多個 instance 輪流處理同一批訪客），它會改成先讀再寫：猜錯要多花兩個指令，先讀只多一個。

### 4.3 過期與清理

- Redis 沒有「hash 欄位層級的 TTL」，所以 Session 是否過期由值開頭的時間決定：超過 90 秒沒心跳的記錄**不會被計入**（毫秒精確，用伺服器傳入的時間）。
- 過期的記錄由三個時機清掉，每次最多 1,000 筆：
  1. 計數時發現有過期記錄（有人開著即時地圖時，幾乎立刻）；
  2. **每 10 分鐘的第一次寫入**順手清一次。上次清理的時間記在 HASH 裡，所以不管是哪個 instance、instance 活多久，都是 10 分鐘一次；
  3. 儲存已滿（50,000 個 Session）時的寫入。
- 因此只要還有任何訪客在線，一筆記錄最晚在「最後一次心跳後 90 秒＋10 分鐘」被刪除。完全沒有訪客時，整個 Key 的 24 小時 TTL 會把它清掉（續期每 6 小時一次，同樣記在 HASH 裡）。功能關掉後不必有人去刪。

### 4.4 指令數（以 Upstash 的計費方式計算）

Upstash 的規則：一般指令算 1 個；`EVAL` 算 1 個，**指令稿裡每執行一個指令再各算 1 個**（[Pricing & Billing](https://upstash.com/docs/redis/overall/billing)）。

| 操作 | 計費指令數 | 內容 |
|---|---|---|
| 心跳或告別，上一筆也是這個 instance 寫的 | **3** | `EVAL` ＋ `HMGET` ＋ `HSET` |
| 同上，但上一筆是別的 instance 寫的（或第一次） | **4** | 先 `HGET`，再上面三個 |
| Session 的第一筆記錄 | 再 +1 | `HLEN`（檢查 Session 上限） |
| 被限流拒絕的寫入（視窗已滿） | 0～1 | 記錄沒有變化，不寫入。多個 instance 輪流處理時要先讀一次（`HGET`） |
| 每 10 分鐘的第一次寫入 | 再 +1～2 | `HGETALL`，有過期記錄時再一個 `HDEL` |
| 每 6 小時的第一次寫入 | 再 +1 | `PEXPIRE` |
| 計數（`GET /api/presence`） | **1** | `HGETALL`；同一個 instance 內 15 秒重用一次 |
| 計數時發現過期記錄 | 再 +3 | 清理指令稿：`EVAL` ＋ `HGETALL` ＋ `HDEL` |
| 第一次接觸（發 Cookie）、暖機期間的請求 | 0 | 不碰儲存 |

這張表不是估算：`tests/presence-redis-store.test.ts` 對本機的真 Redis 逐項比對伺服器自己的指令統計（`INFO commandstats`），替身 Redis 以同一套規則記帳。

### 4.5 正式環境的保護

- 設了共用儲存的環境變數（`KV_REST_API_URL`＋`KV_REST_API_TOKEN`，或 `UPSTASH_REDIS_REST_URL`＋`UPSTASH_REDIS_REST_TOKEN`，Marketplace 會自動注入）就用 Redis；沒設就用記憶體。
- **Vercel Production 沒有共用儲存時，API 回 503 `unconfigured`**，而不是悄悄回錯的數字。Preview 與本機維持記憶體版。
- 儲存連不上時 API 回 503 `unavailable`，回應裡不含位址、Token 或錯誤細節；追蹤器 60 秒後重試。

## 5. 請求量與費用（P6-C 實測）

### 5.1 怎麼量的

`tests/presence-redis-cost.test.ts` 用真正的 API 函式（發 Cookie、暖機、心跳、換頁、告別）在虛擬時鐘上模擬訪客，跑完整的 24 小時，並把儲存層執行的每個指令依 Upstash 的規則計費。同一個劇本跑兩次：一次在替身 Redis 上（可以逐請求歸類），一次在本機的真 Redis 上（比對伺服器自己的指令統計）。**12 個情境兩邊的總數逐一相同。** 原始數字在 [`evidence/presence/p6/redis-cost.json`](evidence/presence/p6/redis-cost.json)。

模擬的前提（改前提就要重跑；都寫在測試檔開頭）：

- 「N 人同時在線」是指任何時刻都有 N 個可見分頁。每位訪客停留 5–15 分鐘後離開，下一位立刻進來（沒有 Cookie）。
- 分頁每 30 秒回報一次；訪客平均每 2 分鐘換一頁（多一次回報）。實測每位訪客每天約 3,300 次心跳（每分鐘 2.3 次）。
- 「有人看地圖」是指全天都有人開著即時地圖，所以每 15 秒有一次計數穿過 CDN 到達伺服器（每天 5,760 次）。「沒人看」則完全沒有計數。
- 「1 個 instance」是一個溫機的伺服器；「3 個 instance」是每個請求隨機落在三個之一。

### 5.2 每個請求的實測成本

| | 1 個 instance | 3 個 instance |
|---|---|---|
| 每次心跳 | 3.09–3.13 | 4.07–4.12 |
| 每次告別 | 3.00–3.02 | 4.03–4.05 |
| 每次計數（2／10／100 人） | 1.15／1.66／3.73 | 同左 |
| 第一次接觸（發 Cookie） | 0 | 0 |

計數的成本隨人數上升，是因為每次有人離開，下一次計數就要清理一次（+3）。100 人時幾乎每次計數都遇到。

### 5.3 每日與每月用量

計費指令數。每格是「沒人看地圖」～「全天有人看地圖」。

| 同時在線 | instance | 每日 | 每月（×30） |
|---|---|---|---|
| 2 | 1 | 21,628～28,112 | 65 萬～84 萬 |
| 2 | 3 | 28,166～34,966 | 84 萬～105 萬 |
| 10 | 1 | 106,572～116,029 | 320 萬～348 萬 |
| 10 | 3 | 140,386～149,982 | 421 萬～450 萬 |
| 100 | 1 | 1,061,206～1,082,631 | 3,184 萬～3,248 萬 |
| 100 | 3 | 1,400,670～1,423,670 | 4,202 萬～4,271 萬 |

換算成比較好用的單位：**每「訪客 · 小時」約 450 個指令**（1 個 instance；3 個時約 590）。

### 5.4 對應到 Upstash 的方案

價格與額度是 2026-11-21 讀到的官方頁面，以該頁為準（[定價](https://upstash.com/pricing/redis)、[計費說明](https://upstash.com/docs/redis/overall/billing)）。

| 方案 | 內容 | 撐得住多少 |
|---|---|---|
| **Free** | US$0；每月 50 萬指令、250 MB、10 GB 流量、1 個資料庫 | 每月約 **1,100 訪客 · 小時**（3 個 instance 時約 850），也就是**平均同時在線約 1.5 人**（全天有人看地圖時約 1.2 人）。2 人已經超過 |
| Pay-as-you-go | 每 10 萬指令 US$0.20；儲存 1 GB 內免費；流量 200 GB 內免費；可設每月預算上限，到了就限流而不是繼續計費 | 2 人：約 US$1.3–2.1／月。10 人：約 US$6.4–9.0。100 人：約 US$64–85 |
| Fixed 250MB | US$10／月，**不計指令數**；流量 50 GB | 大約 12–15 人以上就比隨用隨付便宜；流量大約在 150–200 人時用完（見下） |

- **Free 用完會怎樣**：官方頁面沒有說明 Free 方案達到每月指令上限後的行為（隨用隨付與固定方案寫的是「限流」）。不論是拒絕或限流，本系統的表現都一樣：API 回 503 `unavailable`，地圖上沒有即時人影，網站其餘部分不受影響（`tests/presence-api.test.ts` 有這個情況的測試）。**這一點要在 Preview 上實際確認。**
- **加了付款方式就離開 Free**：官方說明是「新增付款方式會把帳號下所有免費資源改為付費方案」。要留在 Free，就不要綁卡。
- **流量**：每次寫入都把指令稿全文送一次（約 2.2 KB）。實測 Redis 協定的進出位元組，100 人時每月進 21–24 GB、出 0.1–7.5 GB。Free 的 10 GB 大約在 40 人時用完，但指令數早在 1.5 人就先到上限，所以不是實際的限制。真的需要時可改用 `EVALSHA`（只送雜湊），本輪沒有做。
- **記憶體**：100 人時整個 HASH 約 70 KB。任何方案都用不完。
- **延遲**：本機量不出有意義的數字；實際延遲要在 Preview 上量（與函式同區域時預期是個位數毫秒）。

### 5.5 Vercel 這一側

每次心跳、告別、第一次接觸都是一次 Function 呼叫：實測每位在線訪客每天約 3,600 次，每月約 10.8 萬次。計數每個「有人看地圖的 CDN 區域」每天最多 5,760 次。專案的方案與內含額度我讀不到（[PRESENCE_P6_PRODUCTION_READINESS.md](PRESENCE_P6_PRODUCTION_READINESS.md) §5），需要使用者確認。

### 5.6 還能再省的方向（都沒有做）

| 做法 | 效果 | 代價 |
|---|---|---|
| 心跳間隔 30 秒 → 60 秒（逾時 90 → 150 秒） | 指令數約減半 | 離線判定變慢；是產品決定 |
| 把 engine 規則移進 Lua | 3 個 instance 時的 4 降回 3 | 規則會有兩份，要一起維護 |
| 把人口數字附在心跳的回應裡 | 開著地圖的訪客不必另外輪詢 | 回應不再能被 CDN 快取，要重新評估 |
| `EVALSHA` | 流量約減六成 | 多一條「指令稿不在快取」的回退路徑 |

## 6. 測試

| 測試 | 內容 | 結果 |
|---|---|---|
| 共用契約（`tests/helpers/presence-store-contract.ts`） | 記憶體版與 Redis 版跑**同一份**測試：一個 Session 一個位置、多分頁同時回報、多 Session 亂序、亂序送達的心跳與告別、90 秒逾時（毫秒精確）、過期未清理前不計入、告別與被拒絕的寫入都不延長壽命、清空後可重新收滿 | 見 TESTING_STATUS |
| 亂序契約（同一個檔案，P6-A） | 多個 instance 共用一份資料時：兩個分頁都離開後不再計入（P1-44）、告別比第一筆心跳先到、每個 Session 只有一筆記錄、晚處理的請求不會把時間往回撥 | 記憶體 1 個、替身 Redis 3 個、真 Redis 4 個 instance（各用自己的連線） |
| 替身 Redis（`tests/helpers/fake-redis.ts`） | 以 JavaScript 做出與 Lua 相同的行為，**打亂並行呼叫的順序**，並以 Upstash 的規則記帳 | 每次都跑 |
| 真正的 Redis | 本機 `redis-server`（暫時性、只綁 127.0.0.1、不落盤）執行**真正的 Lua 指令稿**，跑同一份契約；另測 2,500 個 Session 的讀取與分批清理、指令稿的每一種回覆、**伺服器的指令統計與計費表逐項相同** | 設了 `PRESENCE_TEST_REDIS_URL` 才跑，否則標示為略過 |
| 成本模擬（`tests/presence-redis-cost.test.ts`，P6-C） | 替身上的兩小時模擬每次都跑，守住 §4.4 與 §5.2 的數字；完整 24 小時、對真 Redis 的版本要另外給一台專用的 `redis-server`（指令統計是整台伺服器的） | 設了 `PRESENCE_COST_REDIS_URL` 才跑 |
| Upstash REST adapter | 以替身 `fetch` 檢查請求格式（`EVAL` 與一般指令）；錯誤訊息不含位址與 Token | 每次都跑 |

重現真 Redis 的測試：

```bash
redis-server --port 6391 --bind 127.0.0.1 --save '' --appendonly no
```

```bash
PRESENCE_TEST_REDIS_URL=redis://127.0.0.1:6391 pnpm exec vitest run tests/presence-redis-store.test.ts
```

重現 24 小時的成本量測（要一台沒有別人在用的 `redis-server`）：

```bash
redis-server --port 6392 --bind 127.0.0.1 --save '' --appendonly no
```

```bash
PRESENCE_COST_REDIS_URL=redis://127.0.0.1:6392 PRESENCE_COST_OUT=/tmp/redis-cost.json pnpm exec vitest run tests/presence-redis-cost.test.ts
```

**還沒驗證的**：對真正的 Upstash 服務（REST 端點是否接受這兩支指令稿與三個一般指令、實際延遲、帳單上的指令數是否與本文相同、Free 方案用完時的行為）。這需要先有資源，屬於使用者決定之後的事；驗收步驟在 [PRESENCE_PREVIEW_VALIDATION.md](PRESENCE_PREVIEW_VALIDATION.md)。

## 7. 待使用者決定

| 編號 | 決定 | 建議 |
|---|---|---|
| S1 | 是否經 Vercel Marketplace 佈建 Upstash Redis | 是，Free 方案起步，**先只接 Preview**。這會建立一個第三方帳號與資源（Free 為 US$0），所以我沒有執行。Free 只夠平均同時在線約 1.5 人（§5.4）：Preview 驗收綽綽有餘，Production 要先看實際流量 |
| S2 | 區域 | 與 Vercel Function 相同的區域（需先確認專案的函式區域；新專案預設是美東 `iad1`）。不需要全球複寫 |
| S3 | 先接 Preview 還是直接 Production | 先只接 Preview，以 `LOGIC_ISLAND_PRESENCE=1` 驗證計數，再接 Production |
| S4 | `snapshotCacheSeconds` 是否調為 15 | **已調為 15**（P6-D，使用者指示） |
| S5 | 授權我唯讀存取 Vercel 專案 | 可選。可補完 §2.1 的最後一列，並在佈建後確認環境變數的名稱（不讀取值） |

| S6 | Production 用哪個方案 | 看 Preview 與上線初期的實際用量再定：平均同時在線 1.5 人以下 Free；10 人以下隨用隨付並設預算上限；更多則固定月費 US$10 |

佈建後不需要再改程式：環境變數一注入、重新部署，`presenceStore()` 就會改用 Redis。`GET /api/presence` 的回應標頭 `x-presence-store` 會是 `shared`（沒接到時是 `memory`）。
