# P8 Activation：A1-L 後續與 A1-P（Preview 驗收）準備

> 2026-11-18，Asia/Taipei。依據：「P8 Activation A1-L Follow-up & A1-P Preparation」（A1-L 結果已接受）。
> 範圍：PR #12 收尾、P1-37、P1-38、Next.js 安全更新，以及 A1-P 的準備。**A1-P 本身沒有執行**；A4（Production 開啟世界旗標）與 A5（首頁切換）沒有批准、沒有開始。
> 上一份：[P8_A1L_LOCAL_PREACCEPTANCE.md](P8_A1L_LOCAL_PREACCEPTANCE.md)。關卡定義：[P8_REGIONAL_WORLD_ACTIVATION_PLAN.md](P8_REGIONAL_WORLD_ACTIVATION_PLAN.md)。
> 本文件的測試全部是本機隔離副本與 headless Chromium 的結果，**不是 Vercel Preview，也不是真機**。

## 0. 結論

- **PR #12 已合併**（Merge Commit `2c636c5`），正式站正常，`/world` 仍是 404（§1）。
- **P1-37 已修正並合併**（PR #13，Merge Commit `36093d2`）：正式建置忽略 `?without=` 與 `?stress=glb`，由伺服器端控制（§2）。
- **P1-38 已修正並合併**（PR #14，Merge Commit `c5c7a1c`）：中央樞紐、`/learn` 摘要與 meta description 讀同一個函式，顯示「12 個互動實驗」（6 個演算法實驗與 6 個工具實驗），規劃中的 7 個不計（§3）。
- **Next.js 16.4.3 → 16.4.5 已合併**（PR #15，Merge Commit `b56e7ec`）：兩則公告都在這一版修正，沒有相容性問題（§4）。
- 三個 PR 各自 CI 全綠後依序以 Merge Commit 合併。合併前先在本機把三者合成一棵整合樹（tree `a364495`）跑完整回歸；合併後 `origin/main`（`b56e7ec`）的 tree 與它**完全相同**，所以 §5 的結果就是現在 `main` 的結果。
- 回歸（§5）：Typecheck 0、ESLint 0、Vitest 1976 通過／0 失敗、兩種建置成功；World-only 全套 E2E **485 通過／113 略過／0 失敗**，Default **425／173／0**；私有題庫洩漏掃描全部 clean。
- 合併後（`b56e7ec`）：Vercel Production 部署 success。正式站 12 個既有頁面都是 200；`/world`、五個 `/world/<region>`、帶審查參數的兩個網址、`/trials`、`/trials/review` 都是 404；首頁沒有指向 `/world` 的連結；`/learn` 的 meta description 已是由資料算出的新文字。`main` 的 `gates` success（run 44311919849）；`36093d2` 與 `c5c7a1c` 兩個中間 commit 的 run 被後續的 push 取消（workflow 的 `cancel-in-progress`），三個 PR 的 head 各自通過了同一組檢查。
- **A1-P 沒有執行**。工具與流程準備好了（§6），缺的是 Preview 的環境變數、帶旗標的部署與自動化存取，都需要你在 Vercel 操作（§6.7、§7）。

四個層級的狀態：

| 層級 | 狀態 |
|---|---|
| A1-L 本機 | 已驗證（2026-11-18，`961db2f`）；這一輪在新的基線上重跑了回歸（§5） |
| A1-P Preview | **尚未執行**。準備完成，缺的條件在 §7 |
| A2 真機 | 尚未執行 |
| A4 Production／A5 首頁 | 未批准，未開始 |

## 1. PR #12 收尾

| 項目 | 結果 |
|---|---|
| 合併前 | `origin/main` 是 `961db2f`，沒有新的提交；PR #12 的 `gates`、Vercel、Vercel Preview Comments 全部 success，`mergeable: MERGEABLE`、`CLEAN` |
| Diff | 57 個檔案，全部在 `docs/` 之下（5 份 Markdown、20 張 JPEG、資料檔與取證腳本）；沒有 `src/`、設定或 lockfile 的變更 |
| 敏感資訊 | 私有題庫掃描（追蹤檔案與 `origin/main..HEAD`）clean；以關鍵字檢查 diff（金鑰、權杖、密碼、電子郵件、本機絕對路徑）只有 Linux Terminal 模擬器畫面中的檔名 `secret.txt`，不是秘密 |
| 其他 worktree | 沒有修改；本輪只在 `logic-island-p8` 與 scratchpad 的隔離副本工作 |
| 合併 | Merge Commit `2c636c5`（2026-11-18T11:27:09Z），tree 與 PR head `319eca4` 相同；沒有 squash、沒有改寫歷史 |
| 合併後 | `main` 的 `gates` success（run 44294826690）、Vercel Production success。正式站 `/`、`/islands`、`/curriculum`、`/learn`、五個 `/regions/*`、`/learn/linux-terminal` 都是 200；`/world`、五個 `/world/<region>`、`/world?without=sys-cs`、`/world/cs?stress=glb`、`/trials`、`/trials/review` 都是 404；首頁沒有指向 `/world` 的連結 |

## 2. P1-37 審查參數（PR #13）

**問題。** `/world?without=<橋 id>`（地圖不畫指定的橋）與 `/world/<region>?stress=glb`（每座島放替身模型的效能測試）是審查用的工具，卻由 client 端在任何含世界頁面的建置中讀取。開啟世界旗標就等於把它們一起公開。

**修正。**

- `src/lib/world/flag.ts` 新增 `worldReviewEnabled()`：建置時 `LOGIC_ISLAND_WORLD_REVIEW=1` 才成立，而且 **`VERCEL_ENV=production` 時一律不成立**。變數被設到 Production 環境也開不起來。
- 兩個世界頁面是 Server Component，在預先渲染時讀取這個值，以 `review` prop 傳給 Client Component。沒有它，總覽不讀網址上的 `without`，區域地圖不理會 `stress`。
- 控制在伺服器端：預先渲染的 HTML 裡寫的是 `review: false`，網址、儲存空間或 client 端程式都改不了它。沒有任何 Client Component 讀環境變數（有測試檢查）。
- 橋樑資料（`WORLD_MAP`）、相機、29 島資料都沒有改動。
- 開發與測試環境保留審查功能：`LOGIC_ISLAND_WORLD_REVIEW=1 next dev` 或以同一個變數建置。`perf/regions.perf.ts` 的 P4（GLB 替身）只在這種建置量測。
- 沒有修改 Vercel 環境變數；正式建置不需要任何新變數，行為就是「忽略」。

**測試。**

| 層級 | 內容 | 結果 |
|---|---|---|
| 單元（`tests/world-review.test.tsx`，9 項） | 旗標的真值表；兩個伺服器頁面在三種建置下傳出的 `review`；Client Component 拿到 `review: false`（或沒有拿到）時對 `?without=`、`?stress=glb` 的反應；環境變數只在 `flag.ts` 讀取、只被兩個伺服器頁面呼叫 | 通過 |
| 變異檢查 | 分別拿掉三處控制（`flag.ts` 的 Production 排除、總覽的 `if (review)`、區域地圖的 `review &&`） | 9 項中 4 項轉為失敗 |
| 建置產物 | World-only：`/world`、`/world/cs` 的 HTML 是 `review: false`。審查變數＋`VERCEL_ENV=production`：仍是 `false`。World＋審查變數：`true` | 符合 |
| E2E，正式建置（World-only） | `/world?without=…`（四種寫法，含全部 8 座橋）畫出的橋與 `/world` 完全相同，位置相同，導覽文字相同；`/world/cs?stress=glb`（三種寫法）地圖內容與 `/world/cs` 相同，沒有「效能測試替身」 | 桌機與手機通過 |
| E2E，審查建置 | `?without=sys-cs` 移除該橋、導覽仍列出；`?stress=glb` 加入替身模型並標示 | 桌機與手機通過 |

CI 的建置不設 `LOGIC_ISLAND_WORLD_REVIEW`，所以之後每個 PR 的檢查都是正式建置的行為。

## 3. P1-38 實驗數量（PR #14）

**資料**（`src/content/world/labs.ts` 的 lab registry，2026-11-18）：

| 分類 | 已實作（有 `/learn/<id>` 路由） | 規劃中（沒有路由） |
|---|---|---|
| 演算法實驗（`kind: 'algorithm'`，即 `src/content/courses.ts` 的六個） | 6 | 0 |
| 工具實驗（`kind: 'tool'`） | 6：色彩與無障礙、Flexbox、CSS Grid、Responsive Layout、Mobile Navigation、Linux Terminal | 7 |
| 合計 | **12** | 7 |

**原因。** 樞紐的數字取自世界 registry 中互動實驗島紀錄的 `labs`（只列六個演算法實驗），`/learn` 的數字取自 lab registry 的已實作項目。

**修正。** 中央樞紐代表整個 `/learn`。

- `openLabCounts()`、`openLabText()`（`src/content/world/labs.ts`）：只算 `status: 'implemented'`；文字是「12 個互動實驗」與「6 個演算法實驗與 6 個工具實驗」，由資料算出。
- 讀同一個函式的地方：區域地圖的中央樞紐（`hubSummary()`）、`/learn` 的摘要、`/learn` 的 meta description。
- `/learn` 的 meta description 原本手寫「…BFS 六個演算法視覺化實驗」，現在的數字與演算法實驗名稱都讀自資料。**這是本輪唯一會出現在正式站的內容變更**，而且只在 `<meta name="description">`，頁面可見內容不變。
- 沒有改的地方：首頁地圖「互動實驗島」面板各分類的「N 個互動實驗」。那是該分類實際列出的實驗數（列的是演算法實驗），與它的清單一致。

**測試。** `tests/lab-counts.test.tsx`（4 項）：計數等於 registry 的已實作數、規劃中的不計、樞紐等於 `/learn`、`/learn` 的摘要數字等於它實際的實驗連結數、description 不含手寫的數字。E2E 新增一項：五個區域地圖上樞紐的數字＝`/learn` 可開啟的實驗連結數＝`/learn` 摘要的數字。測試裡沒有寫死 12；資料改變時，三處會一起改變。

## 4. Next.js 安全更新（PR #15）

| 項目 | 內容 |
|---|---|
| 更新前安裝的版本 | `next` 16.4.3（`package.json` 精確版本，lockfile 相同）。更新後是 16.4.5 |
| GHSA-mfr8-8qww-v76h（CVE-2026-119790，moderate） | 影響 ≥ 16.3.0、≤ 16.4.4，16.4.5 修正。同一個 `'use cache'` 函式同時被直接呼叫與經 `unstable_cache()` 呼叫、且讀取 root params 時，冷啟動的競態會讓不同 root param 的請求拿到同一份快取 |
| GHSA-vc7v-qv4w-wrv8（CVE-2026-119351，moderate） | 影響 ≥ 16.2.0、≤ 16.4.4，16.4.5 修正。Cache Components 開啟時，巢狀 `'use cache'` 的外層可能以缺少 root param 的鍵存入快取 |
| 本專案的使用 | `'use cache'` 0 處、`unstable_cache` 0 處、`next/root-params` 0 處、`next/cache` 0 處，`next.config.ts` 沒有 `cacheComponents`，root layout 沒有動態區段。兩則公告目前都打不到本專案 |
| 修補版本 | 16.4.5（2026-11-03 發布）。GitHub Advisory Database 對 `next@16.4.5` 沒有未撤回的公告（2026-11-18 查詢）。16.4.6 也已發布，沒有新增公告，這次不跨過去 |
| 相容性 | 同一個 minor 的修補版。`dependencies`、`peerDependencies`、`engines` 除了 `@next/env` 的版本外相同；`react` 19.3.1、`@playwright/test` 1.64.1 都在 peer 範圍內 |
| 變更 | `package.json` 一行；lockfile 只有 `next`、`@next/env` 與八個 `@next/swc-*`（42 行對 42 行）。`eslint-config-next` 留在 16.4.3：只在 lint 時使用，不在公告範圍，一起升會改變 lint 規則 |
| 附帶的效果 | 16.4.3 在 agent shell 第一次 `next build` 會被安全性檢查中止（A1-L §2.2）；16.4.5 第一次建置就通過 |

測試結果在 §5（整合樹）。

## 5. 回歸

對象是「`main` `2c636c5`＋PR #13＋PR #14＋PR #15」的整合樹（本機合併 `9688069`，tree `a364495`；這個合併 commit 只存在本機、沒有 push）。三個 PR 合併後 `origin/main` `b56e7ec` 的 tree 也是 `a364495`，內容逐位元組相同。兩份隔離副本：Default（不設旗標）與 World-only（只設 `LOGIC_ISLAND_REGIONAL_WORLD=1`），都沒有設 `LOGIC_ISLAND_WORLD_REVIEW`。取證用 [A1-L 的工具](evidence/p8-a1l/tools)，執行方式與 A1-L 相同。

| 項目 | 結果 | 與 A1-L（`961db2f`）比較 |
|---|---|---|
| Typecheck | Default 0、World-only 0 | 相同 |
| ESLint | 0 | 相同 |
| Vitest | 78 個檔案，**1976 通過／9 略過／0 失敗** | A1-L 是 76 個檔案 1963 通過；多的是 `world-review`（9）與 `lab-counts`（4） |
| Build | Default、World-only 都是**第一次就成功** | A1-L（16.4.3）第一次會被安全性提示中止 |
| 靜態檔案 | Default 與 World-only 的 55 個 chunk／media 路徑與 sha1 相同；不同的只有 build id 目錄名稱 | 相同 |
| E2E，World-only（全套，兩個 project） | **485 通過／113 略過／0 失敗**（28.0 分鐘） | A1-L 481／109。每個 project ＋2 通過、＋2 略過，見下方說明 |
| E2E，Default（全套） | **425 通過／173 略過／0 失敗**（23.4 分鐘） | A1-L 425／165。多的 8 個略過是 4 個新的世界測試 × 2 個 project（Default 沒有世界頁面） |
| 路由與試煉（`phase2.mjs`） | Default、World-only 都沒有失敗項；`/trials` 404、沒有試煉連結與請求；世界頁 `noindex, nofollow` | 相同 |
| V-01～V-10 量測（`a1.mjs`，6 頁 × 七種寬度＝42 個畫面） | 沒有問題項、沒有 console error。draw call、三角形、標籤數、標籤高度、觸控目標 **42／42 與 A1-L 的資料逐項相同**（`/world` 15／15,902；`/world/cs` 58／45,228） | 唯一不同：五個區域地圖的樞紐入口由「6 個互動實驗」變成「12 個互動實驗」 |
| 審查參數（`hooks.mjs`） | `/world?without=…` 六種寫法都畫出全部 8 座橋，與 `/world` 相同；`/world/cs?stress=glb` 等三種寫法沒有替身模型，與 `/world/cs` 相同（58／45,228） | A1-L 時這兩個參數會生效（P1-37） |
| 既有頁面三方比較（`same.mjs`，十頁 × 桌機與手機） | Default 對 World-only 20／20 相同；Default 對 Production 20／20 相同；World-only 對 Production 19／20，見下方說明 | A1-L 三組都是 20／20 |
| 80 堂課程連結、Linux Terminal（`post.mjs`） | Default、World-only、Production 三方都是 80／80，終端機實際輸入正常 | 相同 |
| 腳本量（`bundle.mjs`） | 既有頁面與 Production（當時是 16.4.3）相差在 2 KB 以內（例如 `/` 673 對 672 KB、`/learn/linux-terminal` 852 對 850 KB）；`/world` 695 KB、區域頁 686 KB | 相同量級 |
| 私有題庫洩漏掃描（350 題、18,220 個片段） | 兩份 `.next`（E2E 結束後）、兩份頁面回應、三份課程頁回應，**7 處全部 clean** | 相同 |
| 已發布題目（53 題、252 個片段）對照掃描 | `.next/static` 0 個檔案、HTTP 回應 0 個檔案；`.next/server` 1 個 SSR chunk（兩份建置同一個） | 相同（對照組：題目只在伺服器端，沒有路由送出） |

**E2E 數字的變化。** 新增四個測試：正式建置忽略 `?without=`、正式建置忽略 `?stress=glb`、審查建置的 `?stress=glb`、樞紐數字與 `/learn` 一致。原有的「`?without=` 視覺審查」測試驗證的是審查功能，現在只在審查建置（`LOGIC_ISLAND_WORLD_REVIEW=1`）執行；正式建置上由新的測試驗證相反的行為。所以 World-only 每個 project 多 3 個通過、少 1 個通過（改為略過）、再多 1 個只在審查建置執行的略過。審查建置上的這兩個測試另外跑過，桌機與手機都通過（§2）。沒有為了通過而略過任何測試。

**World-only 對 Production 的 19／20。** 第一次比較時手機版 `/islands` 的整頁截圖雜湊不同，文字、連結、導覽結構都相同。同一個比較再跑三次：兩次相同、一次不同。同一份建置既能得到相同也能得到不同的截圖，所以這是 3D 畫布截圖時機的間歇差異，不是兩個建置之間固定的差異；同一輪的 Default 對 Production、Default 對 World-only 在這一頁都相同，而 Default 與 World-only 的 chunk 逐檔相同。沒有再往下追查是哪一幀不同，A1-P 執行時這一頁要重複比較。

**沒有涵蓋的。** 這些都是本機隔離建置與 headless Chromium 的結果：不是 Vercel 的建置、不是 Preview、不是真機，也沒有量 FPS。

## 6. A1-P 準備

### 6.1 Preview 需要的環境變數

| 變數 | Preview | 說明 |
|---|---|---|
| `LOGIC_ISLAND_REGIONAL_WORLD` | `1` | 唯一要設的變數。建議**只指定給驗收分支**（Vercel 的 Preview 變數可以限定 Git branch），其他 PR 的 Preview 才不會跟著開啟世界頁面 |
| `LOGIC_ISLAND_TRIALS` | 不設 | 設了就不是預計發布的組合 |
| `LOGIC_ISLAND_WORLD_REVIEW` | 不設 | 設了審查參數會生效，preflight 會判定失敗 |
| `LOGIC_ISLAND_PRIVATE_BANK`、`LOGIC_ISLAND_REQUIRE_PRIVATE_BANK` | 不設 | 私有題庫不進任何 Vercel 環境 |
| Production 的任何變數 | 不動 | A4 才處理，需要另外批准 |

環境變數只對之後的部署生效，所以順序是：先設變數，再產生部署（push 驗收分支，或在 Dashboard 對該分支 Redeploy）。

### 6.2 Vercel Authentication 的存取方式

2026-11-18 實測：

| 方式 | 現況 |
|---|---|
| 直接請求 Preview | 所有路徑 302 到 `vercel.com/sso-api`（PR #13 的 Preview 實測） |
| Vercel CLI（`vercel curl`、`VERCEL_OIDC_TOKEN`） | 這台機器的 CLI 已登入，但登入的是另一個 Vercel 帳號，看不到專案所在的 scope；沒有任何 worktree 連結到專案（沒有 `.vercel/`）。目前不能用 |
| Vercel connector（MCP） | 對專案所在的 scope 仍是 403 |
| Protection Bypass for Automation | 尚未取得權杖 |

可行的三條路，擇一：

| 路徑 | 你要做的事 | 特性 |
|---|---|---|
| A. Protection Bypass for Automation（建議） | 在 Dashboard 產生權杖，放進執行驗收的 shell 環境變數 `VERCEL_AUTOMATION_BYPASS_SECRET` | 最少步驟；權杖是長效的，驗收結束後建議撤銷或重新產生 |
| B. CLI 以專案所屬帳號登入並連結 | `vercel login`（專案所屬帳號）、在一個隔離資料夾 `vercel link` | 不產生長效權杖；同專案的 Preview 預設接受開發用 OIDC token。會改變這台機器 CLI 的登入帳號 |
| C. 你登入後人工檢查 | 無 | 不需要任何憑證，但沒有自動化的量測、E2E 與洩漏掃描；只能做 V-01～V-08 的目視部分 |

不論哪一條，憑證都不寫進 repository、文件、PR 或紀錄。不會為了讓自動化通過而關閉 Deployment Protection。

### 6.3 驗收腳本

在 [`evidence/p8-a1p/tools`](evidence/p8-a1p/tools)，說明見 [該資料夾的 README](evidence/p8-a1p/README.md)。

- `preview-proxy.mjs`：Preview 入口。把本機的請求加上存取標頭後轉送到 Preview，所以 A1-L 的腳本與 Playwright 測試不必修改就能對 Preview 執行，憑證也不會出現在指令列、trace 或截圖。
- `preview-check.mjs`：preflight。確認是「世界開、試煉關、審查功能關」的建置，而且不是登入頁。
- `a1p.sh`：依序執行全部項目，preflight 失敗即停止。
- `playwright.remote.config.ts`：對 Preview 跑 World-only 的全套 E2E。

工具已在本機驗證能分辨三種情況（正式建置通過、審查建置失敗、受保護的 Preview 在沒有憑證時被辨識為登入頁）。帶憑證通過保護的部分還沒有驗證。

### 6.4 V-01～V-10 清單（A1-P）

對象是 Preview，寬度 320／375／390／834／1024／1280／1440 px。參考值是 A1-L 與本輪回歸的本機結果。

| 編號 | 檢查 | 通過標準 | 工具 |
|---|---|---|---|
| V-01 | 總覽與五個區域地圖的名牌 | 七種寬度都沒有重疊、出界、被面板遮住 | `a1.mjs` |
| V-02 | 世界橋樑 | 5 座樞紐橋＋3 座關聯橋（cs-ai、design-web、sys-cs），沒有 WEB—SYS | `a1.mjs`、E2E |
| V-03 | 島數 | 8＋7＋4＋4＋6＝29，互動實驗島是樞紐不計入 | `a1.mjs` |
| V-04 | AI 六瓣 | 與 P8.5 的配置相同 | E2E、並排圖目視 |
| V-05 | DESIGN／WEB／SYS 輪廓 | 照提案畫出；定案是 R2，由你決定 | 並排圖 |
| V-06 | CS 四島的科目面板 | 與首頁相同 | `a1.mjs` |
| V-07 | 手機圖釘與 Bottom Sheet | 1024 px 以下是 44×44 的圖釘；Bottom Sheet 佔地圖 ≤ 60%；Escape 回到地圖名牌 | `a1.mjs`、E2E |
| V-08 | 規劃中島嶼與連結 | 25 座規劃中島沒有課程連結；站內連結全部 200 | `a1.mjs` |
| V-09 | 繪製量 | 每頁的 draw call 與三角形與本機相同（`/world` 15／15,902；區域 26～58／14,807～45,228） | `a1.mjs` |
| V-10 | 腳本量 | 與本機建置相同（±1 KB） | `bundle.mjs` |

另外：中央樞紐顯示「12 個互動實驗」（P1-38）；`?without=`、`?stress=glb` 沒有作用（P1-37）。FPS 與觸控手感屬於 A2 真機，不在 A1-P。

### 6.5 安全掃描清單（A1-P）

| 檢查 | 通過標準 | 工具 |
|---|---|---|
| 路由 | `/world` 與五個區域 200；`/world/nowhere` 404；`/trials`、`/trials/review`、`/trials/ipas-aiap-basic`、`/trials/ccar-f` 404 | `preview-check.mjs`、`phase2.mjs` |
| 試煉入口 | 所有頁面沒有 `/trials` 連結、沒有對 `/trials` 的請求；主選單三項 | `phase2.mjs` |
| 審查功能 | 預先渲染的 `review` 是 `false`；兩個參數沒有作用 | `preview-check.mjs` |
| 私有題庫 | Preview 回傳的所有文字回應與 80 堂課程頁，對私有題庫 350 題掃描 clean | `scripts/trials/leak-scan.ts --dir` |
| 已發布題目 | 不出現在任何回應中 | `pubscan.mjs` |
| 既有頁面 | 十個頁面 × 桌機／手機，與本機建置、與 Production 相同（文字、連結、導覽、整頁截圖） | `same.mjs` |
| 課程與實驗 | 80 堂課程連結 200；Linux Terminal 以真實 Enter 執行指令 | `post.mjs` |
| 是否真的是 Preview | 入口統計 `loginPages` 為 0；記錄 deployment URL 與 commit | `preview-proxy.mjs` |
| Console | 0 個錯誤 | `phase2.mjs`、E2E |

Vercel 的建置在 Linux 上執行，`.next` 本身拿不到，所以對建置產物的掃描（A1-L 做過）在 A1-P 改為對「Preview 實際回傳的內容」掃描；伺服器端 chunk 的掃描仍以本機同一個 commit 的建置為準。

### 6.6 回退流程（A1-P 範圍）

A1-P 只碰 Preview，Production 沒有任何變更可以回退。Preview 的收尾：

1. 移除（或保留到 A2）驗收分支的 Preview 變數 `LOGIC_ISLAND_REGIONAL_WORLD`。
2. 刪除驗收分支，或在 Dashboard 刪除該 Preview 部署。
3. 撤銷或重新產生 Protection Bypass 權杖（走路徑 A 時）。
4. 確認正式站 `/world` 仍是 404（每次驗收結束都檢查一次）。

Activation 計畫 A4 要求的「回退演練」（Preview 上開啟 → 回退 → `/world` 回到 404，記錄時間）可以在同一個驗收分支上做：把分支變數移除後 Redeploy，確認該 Preview 的 `/world` 變成 404。這一步要在 A1-P 的蒐證完成之後。

A1-P 中止的條件：preflight 失敗；入口統計出現登入頁；洩漏掃描不是 clean；Production 的任何頁面與驗收前不同。

### 6.7 需要你在 Vercel Dashboard 做的最少操作

1. **Settings → Environment Variables**：新增 `LOGIC_ISLAND_REGIONAL_WORLD`＝`1`，環境只勾 **Preview**，並指定 Git branch（建議名稱 `preview/a1p-world`）。不要勾 Production。
2. **Settings → Deployment Protection → Protection Bypass for Automation**：產生權杖（路徑 A）。在執行驗收的終端機設定 `VERCEL_AUTOMATION_BYPASS_SECRET`，不要貼到對話、文件或 PR。
3. 告訴我可以 push 驗收分支 `preview/a1p-world`（從 `main` 開出、不含程式改動），或你自己在 Dashboard 產生該分支的部署。
4. 部署完成後告訴我 Preview 的網址（或讓我從 commit status 讀取）。

之後由我執行 `a1p.sh` 並回報。R1、R2、R7 的定案仍是 A1 的批准點，要看過 Preview 的並排圖之後由你決定。

## 7. A1-P 尚缺的條件

| 條件 | 狀態 |
|---|---|
| 乾淨的基線（P1-37、P1-38、Next.js 更新都在 `main`） | **具備**：`main` `b56e7ec`（2026-11-18） |
| Preview 環境變數（只有世界旗標） | 未設定（你的操作） |
| 帶旗標的 Preview 部署 | 沒有（需要先有變數，再 push 驗收分支） |
| 自動化存取 | 沒有（§6.2 三條路擇一） |
| 驗收腳本 | 已準備，本機驗證過 |
| R1、R2、R7 | 未定案（A1 的批准點） |

在這些條件具備、而且 `a1p.sh` 對真正的 Preview 跑完之前，A1-P 不是「已通過」。

## 8. 沒有做的事

- 沒有啟用 `LOGIC_ISLAND_REGIONAL_WORLD`，沒有修改任何 Vercel 環境變數或專案設定，沒有部署、沒有切換首頁。
- 沒有執行 A1-P、A2～A5 的任何一項。
- 沒有 force push、squash 或改寫歷史；沒有降低任何測試門檻、沒有新增固定等待。審查功能的測試改為只在審查建置執行（§5 說明），除此之外沒有新增略過。
- 沒有修改 GLB／BLEND、Exam Engine 或私有題庫；私有題庫只用於唯讀的洩漏掃描。
- 沒有修改其他 Session 的 worktree；PR #7（`p6/release-record`）仍與 `main` 衝突，沒有處理。
- 沒有升級 `next` 以外的套件。
