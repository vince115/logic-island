# P8 Activation A1-L：本機預驗收報告

> 2026-11-18，Asia/Taipei。依據：「P8 Activation A1-L 本機預驗收」授權與 [P8 Regional World Activation 計畫](P8_REGIONAL_WORLD_ACTIVATION_PLAN.md)。
> 對象：`main` `961db2fb62fb027d0553ae92b4e76f44af01691c` 的兩份隔離建置。證據：[evidence/p8-a1l/](evidence/p8-a1l/README.md)。
> **這份報告只證明本機結果。** 沒有修改 Production、Vercel 環境變數、正式站入口或任何產品程式；沒有啟用 `LOGIC_ISLAND_REGIONAL_WORLD`；A1-P、A2～A5 都沒有開始。

驗收分四層，本報告只完成第一層：

| 層級 | 狀態 |
|---|---|
| 1. A1-L 本機（隔離建置，headless Chromium） | **已驗證**，結果見下 |
| 2. A1-P Vercel Preview | **尚待驗證**（BLOCKED：計畫的 A0 未完成，見 §9） |
| 3. A2 真機（iOS Safari／Android Chrome／平板） | **尚待驗證**（NOT TESTED） |
| 4. A4 Production 開啟旗標、A5 首頁切換 | **尚未批准**，未開始 |

## 0. 結論

| 項目 | 結果 |
|---|---|
| 發布組合（世界開、試煉關）的 Build 與 Typecheck | PASS |
| `/world` 與五個區域路由 200；`/trials` 404；沒有試煉入口與請求 | PASS |
| 私有題庫洩漏掃描（兩份 `.next`、兩份 HTTP 回應） | PASS（clean） |
| V-01～V-10 | 10 項 PASS（本機）；其中 V-05 的輪廓仍待你定案（R2） |
| World-only 全套 E2E | PASS：481 通過／109 略過／0 失敗 |
| Default 全套 E2E | PASS：425 通過／165 略過／0 失敗 |
| 既有功能回歸（Default、World-only、Production 三方） | PASS：20／20 逐頁相同；80 堂課程連結；Linux Terminal |
| 三項特殊調查 | 已調查並記錄，沒有修改驗收基線（§7） |

沒有 FAIL。需要你決定或知道的事在 §7 與 §8：兩個審查用參數、實驗數量的兩種計數、總覽上一段提到未開放內容的固定文案、Next.js 16.4.3 的兩則安全公告。

## 1. 基線與隔離環境

| 項目 | 內容 |
|---|---|
| `origin/main` | `961db2f`（PR #11 的 Merge Commit）；fetch 後沒有更新的提交 |
| `main` 的 CI | `gates` success（run 43993674683）；Vercel commit status success |
| 既有工作樹 | 沒有修改。`logic-island`（`nav/unified-sidebar`，有其他 Session 未提交的變更）與其餘 worktree 都只讀取 |
| 隔離副本 | `git archive origin/main` 解到兩個資料夾（`default`、`world`），各自一份 `node_modules`（lockfile 與 `main` 相同）；沒有 `private/`，與 Vercel 的建置環境一樣看不到私有題庫 |
| 工具 | Next.js 16.4.3（Turbopack）、Playwright headless Chromium |

旗標名稱與預設值（從程式碼確認，不是假設）：

| 旗標 | 讀取位置 | 判斷 | 預設 |
|---|---|---|---|
| `LOGIC_ISLAND_REGIONAL_WORLD` | `src/lib/world/flag.ts` | `=== '1'` | 關 |
| `LOGIC_ISLAND_TRIALS` | `src/lib/trials/flag.ts` | `=== '1'` | 關 |
| `LOGIC_ISLAND_PRIVATE_BANK`、`LOGIC_ISLAND_REQUIRE_PRIVATE_BANK` | `src/content/trials/private-bank.ts` | 私有題庫的位置與是否強制 | 未設定 |
| `IPAS_FIXTURE`、`CCARF_FIXTURE`、`PAPER_POLICY_FIXTURE`、`RETIREMENT_FIXTURE` | 只有 `e2e/` 讀取 | 測試用 | 未設定 |

`src/` 中沒有其他與試煉或題庫有關的環境變數。建置腳本先清除上表全部變數，World-only 只設第一個。

## 2. 兩種 Build

| | A. Default | B. World-only |
|---|---|---|
| 環境 | 不設任何旗標 | 只有 `LOGIC_ISLAND_REGIONAL_WORLD=1` |
| Typecheck（`tsc --noEmit`） | exit 0 | exit 0 |
| `next build` | 成功，111 個靜態頁 | 成功，116 個靜態頁（多出 `/world/cs`、`ai`、`design`、`web`、`sys`） |
| `/world`、五個 `/world/<region>` | 全部 404 | 全部 200；`/world/nowhere` 404 |
| `/trials`、`/trials/review`、`/trials/ipas-aiap-basic`、`/trials/ccar-f` | 全部 404 | 全部 404 |
| 主選單 | 探索群島｜完整課綱｜互動實驗島 | 相同（沒有「模擬考試」） |
| 指向 `/trials` 的連結、對 `/trials` 的請求 | 0／0（10 頁 × 桌機、手機） | 0／0（16 頁 × 桌機、手機） |
| 既有頁面上指向 `/world` 的連結 | 0 | 0（世界頁之間才有） |
| Console 與未捕捉錯誤 | 0 | 0 |

兩份建置的 `.next/static`（瀏覽器會下載的檔案）是 **58 個檔案、sha1 逐一相同**。也就是說：世界頁的前端程式今天已經在 Default 建置（也就是 Production）的靜態檔裡，只是沒有任何頁面引用；開啟旗標新增的是 6 個路由的 HTML 與 RSC，不是新的前端程式。

### 2.1 題庫

| 檢查 | Default | World-only |
|---|---|---|
| 私有題庫（350 題、18,220 個片段）對 `.next` | clean（建置後 2,406 份文字；E2E 結束後重掃 2,983 份） | clean（2,466 份；重掃 3,079 份） |
| 私有題庫對 HTTP 回應 | clean（189 份頁面回應＋80 份課程頁） | clean（308 份＋80 份） |
| 已發布題目（公開 repo 的 53 題、252 個片段）對 `.next/static` | 0 個檔案 | 0 個檔案 |
| 已發布題目對 HTTP 回應 | 0 個檔案 | 0 個檔案 |
| 已發布題目對 `.next/server` | 1 個 SSR chunk | 同一個 chunk |

最後一列是對照組：掃描找得到題目文字，題目只在伺服器端的一個 chunk 裡，而兩份建置都沒有任何路由把它送出去（`/trials` 是 404）。Default 與 World-only 在這一點上沒有差別。

檢查用的字詞比對一開始把 `/curriculum` 上的已發布課程標題「A20 演算法島綜合試煉」算成試煉字詞；那是課程名稱，Production 上也有，比對改為排除「綜合試煉」後兩份建置都是 0。

### 2.2 Next.js 的升級提示

第一次 `next build` 在產出路由表之後以 exit 1 結束：Next.js CLI 回報 16.4.3 受已知安全公告影響並建議升級，同一指令在 5 分鐘內重跑才放行。兩份建置都是重跑後 exit 0。CLI 訊息中要求執行 `next upgrade` 的段落沒有照做：升級套件不在這次授權內，CLAUDE.md 也要求不自動升級。公告內容與判斷在 §8 F-1。

## 3. V-01～V-10（World-only 建置）

量測範圍：`/world` 與五個區域地圖 × 320／375／390／834／1024／1280／1440 px，共 42 個畫面；每個畫面一張蓋印截圖與一列數據（`data/a1-pages.jsonl`）。

| # | 項目 | 結果 | 依據 |
|---|---|---|---|
| V-01 | 總覽構圖 | **PASS** | 七種寬度都是 6 個名牌（5 Region＋樞紐）全部顯示、在場景內、互不重疊、不在導覽下，沒有水平捲動 |
| V-02 | 橋 | **PASS** | 七種寬度畫出的都是 `hub-cs`、`hub-ai`、`hub-design`、`hub-web`、`hub-sys`、`cs-ai`、`design-web`、`sys-cs`；沒有 WEB—SYS；導覽文字的敘述一致 |
| V-03 | 主題島數量 | **PASS** | 8＋7＋4＋4＋6＝29，地圖名牌與清單在每個寬度都相符；互動實驗島是樞紐，不在 29 之內 |
| V-04 | AI 六瓣配置 | **PASS** | 配置資料自 P8.5（你審過的版本）之後沒有改動；28 個 draw call／25,302 個三角形與 P8.2～P8.5 相同。判斷依據是資料與計數，沒有對舊的 JPEG 截圖做像素比對 |
| V-05 | DESIGN／WEB／SYS | **PASS**（呈現）／R2 待定案 | 三區與提案相同地畫出：26／14,849、26／14,807、37／23,018 |
| V-06 | CS 四座學科島 | **PASS** | 基礎、資料結構、演算法、資料庫四島在 `/?island=<id>` 與 `/world/cs?island=<id>` 的科目面板：名稱、連結（21／24／23／21 個）與文字完全相同 |
| V-07 | 名牌、圖釘與清單 | **PASS** | 320～1024 px 是圖釘（觸控區 44×44）；1280、1440 px 是名牌；沒有任何名牌互相重疊或落在清單下 |
| V-08 | 規劃中的島 | **PASS** | 25 座規劃中島沒有科目面板、沒有課程連結；世界頁上 125 個站內連結全部 200，`/regions/<region>#island-<id>` 的錨點都存在；沒有 `/trials` 連結 |
| V-09 | 效能 | **PASS** | 與基準逐項相同（下表） |
| V-10 | 腳本量 | **PASS**（基準已記錄） | `/world` 693 KB／gzip 221 KB；五個區域頁各 685 KB／218 KB；既有頁面不變（§5） |

最後一幀的 draw call／三角形（主畫面），七種寬度都相同，除了總覽在直式構圖少 36 個三角形：

| 頁面 | 本次 | 基準（P8.4／P8.5） |
|---|---|---|
| `/world`（834 px 以上） | 15／15,902 | 15／15,902 |
| `/world`（390 px 以下） | 15／15,866 | 15／15,866 |
| `/world/cs` | 58／45,228 | 58／45,228 |
| `/world/ai` | 28／25,302 | 28／25,302 |
| `/world/design` | 26／14,849 | 26／14,849 |
| `/world/web` | 26／14,807 | 26／14,807 |
| `/world/sys` | 37／23,018 | 37／23,018 |

沒有量 FPS：headless 桌機 GPU 的幀率不能代表手機，這一項屬於 A2。

### 3.1 互動（375×812 與 1440×1000）

| 流程 | 結果 |
|---|---|
| 清單選「資料庫應用島」 | 網址變成 `?island=databases`，面板與 20 個課程連結出現 |
| 手機科目面板（Bottom Sheet） | 佔地圖高度 56%（標準 ≤ 60%）；關閉後面板消失，島佔整張地圖（截圖兩張） |
| 返回／前進 | 網址與面板一致 |
| Escape | 回到區域全景，焦點落在該島的地圖名牌（P8.6 §6 的修正在這個建置上成立） |
| 網址帶不存在的島 | 回到 `/world/cs` 全景，沒有錯誤 |
| 鍵盤：名牌上按 Enter | 聚焦該島；Escape 後焦點回到名牌 |
| 總覽：AI 名牌上按 Enter、返回 | 進入 `/world/ai`，返回 `/world` |

這些流程的完整斷言在 E2E（§4）；上表是另外取證的結果與截圖。

## 4. E2E

| 執行 | 結果 | 時間 |
|---|---|---|
| World-only 建置，全套 590 個（桌機＋手機） | **481 通過／109 略過／0 失敗** | 27.7 分鐘 |
| Default 建置，全套 590 個 | **425 通過／165 略過／0 失敗** | 23.4 分鐘 |

- World-only 的執行環境只設 `LOGIC_ISLAND_REGIONAL_WORLD=1`，**沒有用雙旗標的結果代替**。`regional-world` 與 `world-topology` 兩份 spec 共 58 個通過。
- World-only 略過的 109 個中，52 個在六份試煉 spec（需要試煉旗標或 fixture，在這個組合下本來就不該執行）；其餘 57 個分散在其他 spec，是原本就依 project（只在桌機或只在手機）或條件略過的測試。各 spec 的通過與略過數在 `data/e2e-world.txt`、`data/e2e-default.txt`。
- Default 的 425／165／0 與 P8.6 合併前的全套結果相同。
- `trials.spec.ts` 通過的 2 個是「沒有試煉旗標時 `/trials` 不存在」的測試。
- 兩輪都加了 `--trace retain-on-failure`。兩輪都沒有失敗，所以沒有產生 trace。

## 5. 既有功能回歸

十個頁面（`/`、`/islands`、`/curriculum`、`/learn`、五個 `/regions/<region>`、`/learn/linux-terminal`）× 桌機 1440×1000 與手機（iPhone 13 模擬），比對可見文字、連結、導覽結構與整頁截圖：

| 比對 | 結果 |
|---|---|
| Default 對 Production | 20／20 四項全部相同 |
| World-only 對 Production | 20／20 四項全部相同 |
| Default 對 World-only | 20／20 四項全部相同 |

| 檢查 | Default | World-only | Production |
|---|---|---|---|
| 課綱與五個區域頁列出的課程連結 | 80／80 為 200 | 80／80 | 80／80 |
| Linux Terminal（真實 Enter：`pwd`、`ls`、`mkdir`） | 正常，檔案樹更新 | 正常 | 正常 |
| `/` 腳本量 | 672 KB／213 KB | 672／213 | 672／213 |
| `/curriculum` | 640／201 | 640／201 | 640／201 |
| `/learn`、`/regions/*` | 634／199 | 634／199 | 635／199 |
| `/islands` | 631／197 | 631／197 | 632／198 |
| `/learn/linux-terminal`、`/learn/bfs` | 850／272 | 850／272 | 850／272 |
| `/curriculum/programs-and-algorithms` | 723／230 | 723／230 | 724／230 |

本機兩份建置的數字完全相同。與 Production 相差的 1 KB 來自不同建置環境產生的 chunk 名稱與分割，P8.6 記錄的也是這組數字。

## 6. 截圖與效能證據

- 六張並排圖（每頁七種寬度）與 14 張原尺寸截圖在 [evidence/p8-a1l/](evidence/p8-a1l/README.md)，每張底部都印有建置、commit、路徑與 viewport。
- 效能數字在 §3 的表與 `data/a1-pages.jsonl`；腳本量在 `data/bundle-*.jsonl`。

## 7. 三項特殊調查

三項都只調查與記錄，**沒有修改產品程式，驗收基線仍是 `961db2f`**。

### A. 審查用參數

實際上有兩個，都只在世界頁的前端程式裡：

| 參數 | 作用（World-only 建置實測） |
|---|---|
| `/world?without=<橋的 id，逗號分隔>` | 3D 地圖不畫指定的橋。`?without=sys-cs` 少一座關聯橋（三角形 15,902 → 15,734）；列出全部 8 座時地圖上沒有任何橋（13 個 draw call）。**導覽文字與場景的無障礙說明不變**，仍然寫「3 座關聯橋」。不認得的值被忽略；值只拿來和已知的 id 比對，沒有寫進頁面（帶 HTML 的值沒有產生任何元素） |
| `/world/<region>?stress=glb` | 效能測試：每座沒有 GLB 的島放一個替身模型（`/world/cs` 58／45,228 → 64／63,484），區塊標題加上「（效能測試替身）」 |

- **Production 今天能不能用**：不能。`/world?without=sys-cs` 與 `/world/cs?stress=glb` 在 Production 與 Default 建置都是 404，因為路由不存在。
- **開啟旗標之後**：任何人都能用。沒有資料外洩或注入的問題；風險是可以分享一個「畫面與文字不一致」的正式站網址（地圖沒有橋、文字說有），以及一個標示為測試替身的區域地圖。
- **決策**（已定）：正式 Production 應忽略這些參數。
- **最小修正方案**（未實作）：由伺服器端頁面讀一個獨立的建置時變數（例如 `LOGIC_ISLAND_WORLD_REVIEW=1`），把布林值當作 prop 傳給 `WorldOverview` 與 `RegionalWorldExplorer`；沒有這個值時前端不讀 `without` 與 `stress`。影響兩個頁面檔與兩個元件。使用這兩個參數的 E2E（`world-topology` 的 visual review 測試）與 `perf/regions.perf.ts` 的 P4 改在帶該變數的建置上執行，並新增「沒有該變數時參數被忽略」的測試。更小的替代做法是直接移除兩個參數與對應測試（V1 已定案，審查用途已結束）。
- 相關但不建議動的東西：區域地圖的 canvas 上掛著量測用的唯讀函式（`__hexProject`、`__hexPerf` 等），E2E 靠它們量島寬。

### B. 實驗數量

| 位置 | 顯示 | 來源 | 計的是什麼 |
|---|---|---|---|
| 區域頁的樞紐入口（`regional-world-explorer.tsx`） | 「6 個互動實驗」 | `hubSummary()` → world registry 互動實驗島紀錄的 `labs`（`AlgorithmId[]`） | 六個演算法實驗（`src/content/courses.ts` 的六份教材） |
| `/learn`（`catalog.tsx`） | 「12 個互動實驗開放中」，12 張可開啟的卡片 | `labRegistry` 中 `status === 'implemented'` 的項目 | 6 個演算法實驗＋6 個工具實驗（色彩與無障礙、Flexbox、CSS Grid、Responsive Layout、Mobile Navigation、Linux Terminal） |

- **不是同一種計數。** 兩者都由資料算出，都不是寫死的文字；差別在資料來源：一個是「互動實驗島這筆紀錄列出的演算法實驗」，一個是「實驗登錄表中已實作的全部實驗」。
- **都不包含未發布內容。** 6 與 12 都只算已實作的；登錄表另有 7 個規劃中的工具實驗，`/learn` 把它們標成「規劃中」且不計入 12。
- 樞紐入口連到的是 `/learn`，使用者點進去看到的是 12，所以「6」會讓人以為少了一半。
- 另有一處寫死的文字：`/learn` 的 metadata description 寫「六個演算法視覺化實驗」（`src/app/learn/page.tsx`），Production 上現在就是這樣。
- **建議的資料驅動計數**（未實作，需要你先確認語意）：在 `src/content/world/labs.ts` 加一個「已實作實驗數」的函式，`/learn` 的摘要與樞紐入口都用它，兩處永遠一致。要先決定的是樞紐代表什麼：若「中央樞紐＝互動實驗島＝`/learn` 的全部實驗」，樞紐入口應顯示 12；若樞紐只代表六個演算法實驗，就該把文字改成「6 個演算法實驗」而不是改數字。首頁清單的互動實驗島目前也只列六個演算法實驗，兩處應一起決定。

### C. P1-36

| 執行 | `islands-candidate.spec.ts:129` |
|---|---|
| World-only 全套 | 桌機、手機都通過 |
| Default 全套 | 桌機、手機都通過 |
| 加壓重複：手機 project、每份建置 60 次、6 個平行 worker（負載到 13～17）、保留 trace | Default 60／60、World-only 60／60 通過 |

這次沒有再出現，所以沒有新的重現條件或根因證據；P1-36 維持「無法重現、未修正」。累計加壓次數是 700 次（P8.6 的 580 次加這次 120 次）0 失敗。trace 設定在每一輪都開著，沒有失敗所以沒有產生檔案。沒有增加等待、沒有降低斷言、沒有標記 skip。

## 8. 其他發現

| # | 發現 | 影響 | 建議 |
|---|---|---|---|
| F-1 | Next.js 16.4.3 有兩則安全公告：[GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h)、[GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8)，嚴重度都是 moderate，影響到 16.4.4 為止 | 兩則都與 `'use cache'`／`unstable_cache()` 有關；`src/` 與 `next.config.ts` 中這兩者的使用是 0 處，所以本案沒有用到受影響的功能。副作用是在 Agent 環境執行 `next build` 第一次會被擋下一次 | 升級是獨立決策，不屬於 Activation；建議在 A4-1 之前另案處理，讓開啟旗標的那次部署不同時帶著套件升級 |
| F-2 | 世界總覽的導覽有一段寫死的文字：「規劃中　中央挑戰島（APCS Trial、AI Capstone）尚未開放」（`world-overview.tsx:91`） | 不是連結、不發出請求、不是試煉入口；但它會在正式站上預告一個尚未公開的功能名稱 | 由你決定公開版本要不要保留 |
| F-3 | 世界頁仍標示為原型：`robots: noindex, nofollow`、標題含「Regional World 原型」、導覽寫「PROTOTYPE」 | 與計畫 A4-1 的「不加入口、保留 noindex」一致 | A4-2 才處理 |
| F-4 | 在地圖名牌上按 Enter 聚焦一座島之後，焦點落在 `body`（該島的名牌被移除） | 首頁在 Production 上是同樣的行為，不是 P8 造成的；下一次 Tab 會進入地圖的鍵盤操作區 | 併入 A3 的 N-05／N-07 與 A2 的螢幕閱讀器檢查，不在這次處理 |
| F-5 | 世界頁的前端程式已在 Production 的靜態檔中（§2） | 沒有安全影響；代表開啟與回退旗標都不會改變瀏覽器下載的程式 | 無 |

## 9. A1-P 所需的最小操作清單

A1-P 是把 §3～§5 對 Vercel Preview 重做一次。目前擋住它的是計畫的 A0：

| # | 操作 | 誰 | 現況 |
|---|---|---|---|
| 1 | 在 Vercel 專案的 **Preview** 環境加入 `LOGIC_ISLAND_REGIONAL_WORLD=1`；不設 `LOGIC_ISLAND_TRIALS`；不動 Production | 你（Dashboard），或先授權 connector／CLI 存取這個專案 | 未做。connector 對這個 scope 仍是 403 |
| 2 | 產生一個帶旗標的 Preview 部署：從 `main` 開一個不含程式改動的驗收分支並 push，或在 Dashboard 對既有 Preview 重新部署 | push 需要授權；重新部署是你的操作 | 未做 |
| 3 | 提供自動化存取：Protection Bypass for Automation 的權杖只放在本機環境變數，不寫進 repo、文件或紀錄；或由你登入後人工檢查 | 你 | 未做。目前 Preview 所有路徑都 302 到 Vercel 登入 |
| 4 | 回報 Preview URL 與 commit | 你 | — |

拿到之後 Agent 要做的事（不需要新的工具）：以 `tools/` 的腳本對 Preview URL 重跑路由與試煉入口檢查、42 個畫面的量測與截圖、既有頁面對 Production 的比對、80 堂課程連結、對下載回應的洩漏掃描；結束後請你移除 Preview 環境變數並刪除驗收分支。

A1-P 之前建議先決定的兩件事：§7-A 的參數要不要先修（修了之後 Preview 驗的才是預計發布的程式），以及 F-1 的升級要不要先做。

## 10. 沒有做的事

- 沒有修改產品程式、測試、設定或套件；這個分支只新增文件與證據。
- 沒有修改 Vercel 環境變數，沒有部署，沒有啟用旗標，沒有更動正式站入口。
- 沒有開始 A1-P、A2、A3、A4、A5。
- Vitest 與 ESLint 沒有列為驗收項目（這次沒有改程式）；但這個文件分支在提交前以隔離副本跑過一次 CI 的同一組檢查：Typecheck exit 0、ESLint（含 `tools/` 的腳本）exit 0、Vitest 76 個檔案 1963 通過／9 略過／0 失敗。
- 沒有真機、沒有 Preview、沒有 FPS 量測。
