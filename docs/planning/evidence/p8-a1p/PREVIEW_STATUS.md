# P8 Activation A1-P：Preview 環境狀態

> 2026-11-19（Asia/Taipei）更新。狀態：**Preview 已在變數設定後重新部署；存取仍 BLOCKED；A1-P 驗收尚未執行**。
> 準備文件：[P8_A1P_PREVIEW_PREPARATION.md](../../P8_A1P_PREVIEW_PREPARATION.md)。工具：[README](README.md)。

BLOCKED 指的是 Vercel Authentication 擋住了對 Preview 的請求，**不是產品測試失敗**。沒有任何一項產品檢查對 Preview 執行過。

## 五個層級

| 層級 | 狀態 | 證據 |
|---|---|---|
| Preview 環境已建立 | **部署存在**，建置時間在使用者設定變數之後；旗標是否生效**尚未由回應驗證** | 下方「部署」 |
| Preview 可存取 | **否（BLOCKED）** | 下方「Preflight」 |
| A1-P 驗收已通過 | **否，尚未執行** | 沒有任何 Preview 的量測、截圖或 E2E 結果 |
| A2 真機 | 尚未執行 | — |
| A4 Production 世界旗標／A5 首頁 | 未批准，未開始 | 正式站 `/world`、`/trials` 仍是 404 |

## 部署

| 項目 | 值 |
|---|---|
| 驗收分支 | `preview/a1p-world` |
| Commit | `bb5dcf7`（第二個空 commit，tree `dafd968` 與 `main` `070f440` 相同；沒有程式、首頁或題庫的改動） |
| Vercel commit status | `Vercel`：success，「Deployment has completed」（2026-11-19T00:49:21Z） |
| 前一次部署 | `3809306`（2026-11-18T15:38:10Z），在變數設定之前建置，已被取代 |
| Preview URL（分支別名） | `https://logic-island-git-preview-a1p-world-vince115s-projects.vercel.app` |
| CI | 這個分支不觸發 `trials-ci`（只有 `main`、`trials/**` 與 PR 會） |

兩件實測到的事：

- 第一次 push 時分支指向 `main` 的同一個 commit（`070f440`），Vercel 沒有為它產生 Preview 部署：五分鐘後分支別名仍是 404，該 commit 只有 Production 的那一筆 status。補上空 commit 後，約 40 秒完成部署。
- Vercel 的環境變數只對之後的部署生效。使用者回報已設定 `LOGIC_ISLAND_REGIONAL_WORLD=1`（Preview，只限 `preview/a1p-world`，Production 未修改）之後，以空 commit `bb5dcf7` 重新部署。
- **這次部署是否真的帶著旗標，還沒有獨立驗證**：所有路徑都被登入頁擋住，從外面看不到 `/world` 是 200 還是 404；Vercel 連接器與 CLI 也讀不到專案的變數或建置紀錄。目前的依據只有使用者的回報與部署時間的先後。

## Preflight（不帶憑證，兩次）

`preview-proxy.mjs` 指向上面的 Preview URL，執行 `preview-check.mjs`：

| 時間 | 部署 | 結果 |
|---|---|---|
| 2026-11-18T15:38:45Z | `3809306`（變數設定前） | BLOCKED，[`data/preflight-2026-11-18-blocked.json`](data/preflight-2026-11-18-blocked.json) |
| 2026-11-19T00:49:49Z | `bb5dcf7`（變數設定後） | BLOCKED，[`data/preflight-2026-11-19-blocked.json`](data/preflight-2026-11-19-blocked.json) |

兩次的內容相同：

| 檢查 | 結果 |
|---|---|
| 入口 | `access: none`；1 個請求，其中 1 個是 Vercel 登入頁 |
| `app` | FAIL：`/` 回 302，導向 Vercel 登入 |
| 其餘項目 | 沒有執行（preflight 在這裡停止） |

直接請求（不經入口）：`/`、`/world`、五個 `/world/<region>`、`/trials`、`/world?without=sys-cs`、`/world/cs?stress=glb` 全部是 302 → `vercel.com/sso-api`。這些 302 是保護頁，不能用來判斷路由是 200 還是 404。

Preflight 要確認的七項，目前的狀態：

| 項目 | 狀態 |
|---|---|
| `LOGIC_ISLAND_REGIONAL_WORLD=1` | 未確認（BLOCKED） |
| `LOGIC_ISLAND_TRIALS` 關閉 | 未確認（BLOCKED） |
| `LOGIC_ISLAND_WORLD_REVIEW` 關閉 | 未確認（BLOCKED） |
| `/world` 與五個 `/world/<region>` 回 200 | 未確認（BLOCKED） |
| `/trials` 回 404 | 未確認（BLOCKED） |
| 審查用 URL 參數不生效 | 未確認（BLOCKED） |
| Preview 部署對應正確 commit | **是**：`bb5dcf7` 的 commit status 是 success，分支別名指向該分支最新的部署 |

## 存取現況

| 方式 | 2026-11-19 的狀態 |
|---|---|
| `VERCEL_AUTOMATION_BYPASS_SECRET`、`VERCEL_OIDC_TOKEN` | 執行環境中都沒有設定 |
| Vercel CLI | 登入的是另一個帳號，看不到專案所在的 scope；沒有 worktree 連結專案 |
| Vercel connector（MCP） | 對專案所在的 scope 仍是 403；該連線名下沒有任何 team |

沒有關閉或放寬 Deployment Protection，沒有修改任何 Vercel 設定或環境變數。

## 解除 BLOCKED 需要的最少操作（使用者）

1. ~~環境變數~~：使用者已於 2026-11-19 回報設定完成。
2. **存取**（擇一，目前唯一缺的條件）：
   - A. Settings → Deployment Protection → **Protection Bypass for Automation** 產生權杖，存成 repository 之外、只有本人可讀的檔案（一行 `VERCEL_AUTOMATION_BYPASS_SECRET=<值>`），告知檔案位置。腳本只把它讀進環境變數，不顯示、不寫入任何紀錄。驗收結束後撤銷或重新產生。
   - B. 用專案所屬帳號在這台機器 `vercel login`，再於隔離資料夾 `vercel link`（會改變這台機器 CLI 的登入帳號）。
   - C. 授權 Vercel 連接器存取專案所在的 team（由我產生一次性的同意連結，10 分鐘內有效）。之後可以讀取部署與變數設定，並為這個 Preview 部署建立暫時的分享連結（約 23 小時內，持有連結的人都能看該部署），範圍只限這一個部署。
3. 存取具備後不需要再重新部署：直接執行 preflight 與 `a1p.sh`。

不需要、也不應該：關閉 Deployment Protection、修改 Production 的變數、把權杖貼到對話或文件。
