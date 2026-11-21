# Presence 共用儲存評估（P4）

> 日期：2026-11-21 ｜ 分支：`presence/visitor-population` ｜ 狀態：**設計與測試完成；沒有建立任何雲端資源，沒有修改任何環境變數**
>
> 主文件：[PRESENCE_POPULATION_SYSTEM.md](PRESENCE_POPULATION_SYSTEM.md)。本文件回答「Presence 上 Vercel 正式環境要用什麼儲存」，並記錄已實作、已測試的 `RedisPresenceStore`。

## 1. 結論

**建議：Upstash Redis，經 Vercel Marketplace 佈建（`upstash/upstash-kv`），先用 Free 方案，單一區域。**

- 它是唯一同時滿足「HTTP 存取（不需連線池）、指令稿原子更新、免費起步、Marketplace 自動注入環境變數」的選項。
- 程式已經寫好並測過：[`src/lib/presence/redis-store.ts`](../../src/lib/presence/redis-store.ts)。它只用 `EVAL` 一個指令，不需要新增任何 npm 套件，也不綁定 Upstash（任何 Redis 相容服務只要一個幾行的 adapter）。
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
| TTL | Key 層級；本設計用 ZSET 分數判定過期（毫秒精確） | 同左 | 沒有；查詢時過濾＋定期 `DELETE` | 有，但刪除是延遲的，查詢仍須過濾 |
| 延遲 | 同區域通常為個位數到十幾毫秒（**本輪未量測**） | 同區域最低，但冷啟動要建連線 | 查詢本身快；閒置後喚醒較慢 | 個位數毫秒 |
| 免費額度 | 256 MB、每月 50 萬指令、10 GB 流量 | 30 MB 資料庫 | 各家有免費方案；心跳會讓運算無法休眠 | 有常設免費額度（細節未確認） |
| 計費 | 隨用隨付每 10 萬指令 US$0.20；或固定月費（US$10 起、不計指令數） | 月費制（細節未確認） | 運算時數＋儲存 | 依讀寫請求數（現行單價未確認） |
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

| Key | 型別 | 內容 |
|---|---|---|
| `li:presence:records` | HASH | Session ID → 該 Session 的記錄（JSON，即 `SessionRecord`） |
| `li:presence:seen` | ZSET | Session ID → 最後一次心跳的伺服器時間（毫秒） |

存的東西和記憶體版完全一樣：隨機 Session ID、位置、幾個時間戳、限流計數。**沒有 IP、User-Agent 或任何可辨識個人的資料。**

### 4.2 原子更新：比較後才寫入

寫入是一支 Lua 指令稿（`WRITE_SCRIPT`）：「只有當記錄仍是我做決定時看到的那一筆，才換成新的；否則把現在的記錄還給我」。收到衝突就用新的記錄重新跑一次 `engine.ts` 的判斷。

- 規則只有一份（TypeScript 的 engine），Lua 只有十幾行、不含任何業務邏輯。
- 兩個 instance 同時處理同一個 Session 的兩個分頁，結果一定等於「某一種先後順序」的結果，不會是混合狀態；限流計數也不會漏算。
- 同一個 instance 內，同一個 Session 的寫入會排隊，所以只有「別的 instance」才會造成衝突。

### 4.3 過期與清理

- Redis 沒有「hash 欄位層級的 TTL」，所以 Session 是否過期由 ZSET 的分數決定：超過 90 秒沒心跳的記錄**不會被讀出來**（毫秒精確，用伺服器傳入的時間）。
- 過期的記錄由下一次計數（每次最多清 1,000 筆）或「儲存已滿時的寫入」清掉。
- 兩個 Key 本身帶 24 小時的 TTL，每次寫入續期。功能關掉後不必有人去刪，一天後資料自己消失。

### 4.4 指令數

| 操作 | 指令數 |
|---|---|
| 心跳，上一筆也是這個 instance 寫的 | 1 |
| 心跳，上一筆是別的 instance 寫的（或第一次） | 2 |
| 告別 | 1–2 |
| 計數（`GET /api/presence`） | 1，同一個 instance 內 5 秒重用一次 |

### 4.5 正式環境的保護

- 設了共用儲存的環境變數（`KV_REST_API_URL`＋`KV_REST_API_TOKEN`，或 `UPSTASH_REDIS_REST_URL`＋`UPSTASH_REDIS_REST_TOKEN`，Marketplace 會自動注入）就用 Redis；沒設就用記憶體。
- **Vercel Production 沒有共用儲存時，API 回 503 `unconfigured`**，而不是悄悄回錯的數字。Preview 與本機維持記憶體版。
- 儲存連不上時 API 回 503 `unavailable`，回應裡不含位址、Token 或錯誤細節；追蹤器 60 秒後重試。

## 5. 請求量與費用估算

設 **V = 平均同時在線（分頁可見）的訪客數**。

| 項目 | 算式 | 每月量 |
|---|---|---|
| 心跳請求 | 每人每分鐘 2 次 × 60 × 24 × 30 | 86,400 × V |
| Redis 指令（心跳） | 每次 1–2 個 | 86,400–172,800 × V |
| 計數請求 | CDN 快取 5 秒，每個有人看地圖的 CDN 區域每分鐘最多 12 次 | 最多約 518,000 × f |

f 是「有人開著地圖且 `NPC=live`」的時間比例。

| 平均同時在線 V | 每月 Redis 指令（心跳） | Upstash 隨用隨付的費用 |
|---|---|---|
| 2 | 17–35 萬 | Free 方案內（上限 50 萬） |
| 10 | 86–173 萬 | 約 US$1.7–3.5 |
| 100 | 860–1,730 萬 | 約 US$17–35 |
| 1,000 | 0.86–1.73 億 | 約 US$170–350；這個量級應改用固定月費方案 |

兩個要注意的地方：

1. **計數請求可能比心跳還多。** 只要一直有人開著地圖，光是計數每月就接近 50 萬次。上線時建議把 `snapshotCacheSeconds` 由 5 調到 15（和地圖的輪詢間隔一致），計數請求降為三分之一；這是一個常數，本輪沒有改。
2. Vercel 這一側，每次心跳也是一次 Function 呼叫（每月 86,400 × V 次）。專案的方案與內含額度我讀不到，需要使用者確認。

降低用量的後續手段（都還沒做）：把 engine 規則移進 Lua（每次心跳固定 1 個指令，代價是規則有兩份）；心跳間隔由 30 秒改 60 秒（離線判定會變慢）；把人口數字附在心跳的回應裡（開著地圖的訪客就不必另外輪詢）。

## 6. 測試

| 測試 | 內容 | 結果 |
|---|---|---|
| 共用契約（`tests/helpers/presence-store-contract.ts`） | 記憶體版與 Redis 版跑**同一份**測試：一個 Session 一個位置、多分頁同時回報、多 Session 亂序、亂序送達的心跳與告別、90 秒逾時（毫秒精確）、過期未清理前不計入、告別與被拒絕的寫入都不延長壽命、清空後可重新收滿 | 見 TESTING_STATUS |
| 替身 Redis（`tests/helpers/fake-redis.ts`） | 以 JavaScript 做出與 Lua 相同的行為，並**打亂並行呼叫的順序**，模擬多個 instance | 每次都跑 |
| 真正的 Redis | 本機 `redis-server`（暫時性、只綁 127.0.0.1、不落盤）執行**真正的 Lua 指令稿**，跑同一份契約，另測 2,500 個 Session 的讀取與分批清理 | 設了 `PRESENCE_TEST_REDIS_URL` 才跑，否則標示為略過 |
| Upstash REST adapter | 以替身 `fetch` 檢查請求格式；錯誤訊息不含位址與 Token | 每次都跑 |

重現真 Redis 的測試：

```bash
redis-server --port 6391 --bind 127.0.0.1 --save '' --appendonly no
```

```bash
PRESENCE_TEST_REDIS_URL=redis://127.0.0.1:6391 pnpm exec vitest run tests/presence-redis-store.test.ts
```

**還沒驗證的**：對真正的 Upstash 服務（REST 端點、實際延遲、Free 方案限制）。這需要先有資源，屬於使用者決定之後的事。

## 7. 待使用者決定

| 編號 | 決定 | 建議 |
|---|---|---|
| S1 | 是否經 Vercel Marketplace 佈建 Upstash Redis | 是，Free 方案起步。這會建立一個第三方帳號與資源（Free 為 US$0），所以我沒有執行 |
| S2 | 區域 | 與 Vercel Function 相同的區域（需先確認專案的函式區域；新專案預設是美東 `iad1`）。不需要全球複寫 |
| S3 | 先接 Preview 還是直接 Production | 先只接 Preview，以 `LOGIC_ISLAND_PRESENCE=1` 驗證計數，再接 Production |
| S4 | `snapshotCacheSeconds` 是否調為 15 | 是，在開 `NPC=live` 之前 |
| S5 | 授權我唯讀存取 Vercel 專案 | 可選。可補完 §2.1 的最後一列，並在佈建後確認環境變數的名稱（不讀取值） |

佈建後不需要再改程式：環境變數一注入、重新部署，`presenceStore()` 就會改用 Redis。
