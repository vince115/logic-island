# P8 Activation A1-P（Preview 驗收）工具

> 2026-11-18，Asia/Taipei。狀態：**只有工具與流程，A1-P 尚未執行**。這個資料夾目前沒有任何 Preview 的驗收結果。
> 計畫與前置條件：[P8_A1P_PREVIEW_PREPARATION.md](../../P8_A1P_PREVIEW_PREPARATION.md)。

A1-P 與 A1-L 用同一批量測腳本（[`../p8-a1l/tools`](../p8-a1l/tools)），差別只有對象：A1-L 是本機隔離建置，A1-P 是 Vercel Preview。Preview 受 Vercel Authentication 保護，所以多了一個「入口」把存取憑證加在請求上，其餘腳本不必修改。

## 工具（`tools/`）

| 檔案 | 用途 |
|---|---|
| `preview-proxy.mjs` | Preview 入口：本機 `http://127.0.0.1:3150` 的每個請求轉送到 `PREVIEW_URL`，並加上存取標頭。憑證只從環境變數讀取，不出現在指令列、頁面、trace 或截圖；`/__proxy/status` 回報有多少回應其實是 Vercel 登入頁 |
| `preview-check.mjs` | Preflight：確認入口後面是「世界開、試煉關、審查功能關」的建置，而且真的是部署本身、不是登入頁。失敗就不必往下做 |
| `a1p.sh` | 整個 A1-P 一次跑完：preflight → 路由與試煉 → V-01～V-10（七種寬度）→ 80 堂課程與 Linux Terminal → 腳本量 → 與本機建置、與 Production 比較 → World-only 全套 E2E → 洩漏掃描 → 入口統計 |
| `playwright.remote.config.ts` | 對已經在執行的伺服器跑 repo 的兩個 Playwright project，不建置、不啟動伺服器 |

這些腳本不部署、不修改任何 Vercel 設定、不寫入 Production（只讀取正式站做比較）。`preview-proxy.mjs` 預設拒絕把正式站網址當成 `PREVIEW_URL`。

## 存取憑證（擇一，只放在執行腳本的 shell 環境變數）

| 環境變數 | 送出的標頭 | 來源 |
|---|---|---|
| `VERCEL_AUTOMATION_BYPASS_SECRET` | `x-vercel-protection-bypass` | 專案 Settings → Deployment Protection → Protection Bypass for Automation |
| `VERCEL_OIDC_TOKEN` | `x-vercel-trusted-oidc-idp-token` | 已連結專案的 `vercel env run`／`vercel env pull`（短效；同專案的 Preview 預設可用） |

兩者都不設時，請求原樣轉送，用來確認保護頁確實存在。**憑證不得寫進 repository、文件、PR、紀錄或截圖。**

## 執行順序

```sh
# 0. 隔離副本：與 Preview 同一個 commit，World-only 建置並啟動（比較用）
mkdir -p <work>/world && git archive <commit> | tar -x -C <work>/world    # 再放入 node_modules（pnpm install --frozen-lockfile）
cp ../p8-a1l/tools/* <work>/ && echo <commit> > <work>/COMMIT
sh <work>/build.sh world                            # 清除所有旗標，只設 LOGIC_ISLAND_REGIONAL_WORLD=1
( cd <work>/world && LOGIC_ISLAND_REGIONAL_WORLD=1 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3132 ) &

# 1. Preview 入口（憑證已在環境變數中）
PREVIEW_URL=https://<deployment>.vercel.app node tools/preview-proxy.mjs 3150 &

# 2. 全部驗收
LOGIC_ISLAND_PRIVATE_BANK=<私有題庫 checkout> sh tools/a1p.sh <work>/world <out-dir> <commit>
```

`a1p.sh` 在 preflight 失敗時停止。最後一步若入口統計的 `loginPages` 不是 0，整次執行作廢（有請求拿到的是登入頁）。

## 工具本身的驗證（2026-11-18，本機）

沒有 Preview 存取權時能驗證的部分：

| 情境 | 預期 | 結果 |
|---|---|---|
| 入口指向本機 World-only 建置，執行 preflight | PASS | PASS（app、routes、review-prop、no-trial-links、static-identity、without-ignored、stress-ignored、no-login-pages） |
| 入口指向本機「審查建置」（多設 `LOGIC_ISLAND_WORLD_REVIEW=1`） | FAIL | FAIL（review-prop、without-ignored、stress-ignored） |
| 入口指向真正受保護的 Preview，不帶憑證 | FAIL，並辨識出登入頁 | FAIL（`/` 回 302 到 Vercel 登入；`loginPages` 1／1） |
| `PREVIEW_URL` 設為正式站網址 | 拒絕啟動 | 拒絕（exit 2） |

還沒有驗證的部分：帶憑證通過 Vercel 保護、`a1p.sh` 對真正的 Preview 從頭跑到尾。這兩項要等存取條件具備。

## 結果要放在哪裡

A1-P 執行後，結果放在這個資料夾的 `data/`、`shots/`、`sheets/`，與 A1-L 相同的結構；截圖以 `A1-P | preview | <commit>` 蓋印。E2E trace、下載的回應與建置不提交（同 A1-L 的規則）。
