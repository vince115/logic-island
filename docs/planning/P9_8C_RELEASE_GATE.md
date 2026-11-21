# P9.8c Shared Canvas 啟用前 Release Gate

> 2026-11-21。P9.8c 的程式碼經使用者批准合併至 `main`（PR #38，Merge Commit `f36ba39`；`main` CI 與 Production 部署成功）。
> **Shared Canvas 沒有獲准在 Production 啟用。** `LOGIC_ISLAND_P9_SHARED_CANVAS` 預設關閉，且只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 同時設定時才有作用（`src/lib/p9/flag.ts`）。
> 本清單列出在任何 Production 部署開啟 `LOGIC_ISLAND_P9_SHARED_CANVAS=1` 之前必須完成的項目。**清單內 Pending 的項目不可在沒有實際證據的情況下改為 Passed。**

## 1. 狀態總覽

| # | 項目 | 狀態 | 證據／說明 |
|---|---|---|---|
| G1 | iPhone Safari 實機驗證 | **Pending** | 依 [P9_8C_DEVICE_CHECKLIST.md](P9_8C_DEVICE_CHECKLIST.md) 第 1–8 節；目前沒有 iOS 裝置或 WebKit 測試結果 |
| G2 | Android Chrome 實機驗證 | **Pending** | 同上；headless Chromium 手機模擬不能代替 |
| G3 | 背景切換與長時間使用 | **Pending** | 實機清單第 5、6 節（切到背景後恢復、30 分鐘以上使用、Safari 記憶體） |
| G4 | 真實觸控、縮放與旋轉 | **Pending** | 實機清單第 2 節（單指拖曳、雙指縮放、直橫向旋轉）；模擬器結果不算 |
| G5 | Heap 首 10 次往返 +2.8 MB 例外 | **Pending（例外待使用者決定）** | 原始標準「第 1–10 次 < 2 MB」**未通過**。見第 2 節 |
| G6 | 直接開啟 `/cs` 初始 JS +1.04% 例外 | **Pending（例外待使用者決定）** | 只在 P9 開啟時；見第 3 節 |
| G7 | 真實 WebGL context loss（手機） | **Pending** | 實機清單第 7 節；自動化只用 `WEBGL_lose_context` 模擬 |
| G8 | GPU 記憶體 | **Pending（未量測）** | headless Chromium 無法取得；需在實機或桌機瀏覽器的工具中觀察 |
| G9 | 啟用決定與 Production 旗標變更 | **Pending（使用者決定）** | Agent 不得自行修改 Vercel Production 環境變數 |

已在自動化環境完成的項目（不屬於本清單的 Pending 項目，紀錄見 [P9_8C_SHARED_CANVAS_CS.md](P9_8C_SHARED_CANVAS_CS.md) 第 6、7、11 節）：四種旗標模式 E2E 0 失敗、30／60 次往返資源、bundle 比較、context loss 備援與焦點管理（桌機與手機模擬）。

## 2. 例外紀錄：Heap 首 10 次往返（G5）

- **標準**：第 1–10 次往返之間，GC 後 JS heap 增加 < 2 MB。
- **結果**：Shared 開啟 +2.8 MB（手機模擬 +2.9 MB），**未通過**。Shared 關閉為 +7.2 MB，同樣未通過。
- **Steady state**：第 10–30 次每次 +0.027 MB，第 30–60 次相同。Heap snapshot 差異中，應用程式物件約 +8 KB，其餘為 V8 編譯碼與瀏覽器 Performance Timeline。
- **限制**：只在桌機 headless Chromium 量測；Safari／WebKit 沒有數據。
- **需要的決定**：是否以 warm-up 後的 steady state 作為驗收標準。決定前本項維持 Pending。

## 3. 例外紀錄：直接開啟 `/cs` 的初始 JS（G6）

- **結果**：直接開啟 `/cs`（P9 開啟）的初始載入，對 `main` P9.8b 為 decoded +1.04%（595.8 → 602.0 KB）、gzip +0.89%。
- **原因**：`regionFrame` 與 world-placements 幾何（約 4 KB），是 camera handover 需要的程式。再縮小需要重構，本階段不處理。
- **範圍**：本項只在 P9 開啟時發生。P9 關閉的 Production 頁面另有一項合併後的發現（第 4 節）。
- **需要的決定**：是否接受此增加。決定前本項維持 Pending。

## 4. 合併後紀錄：P9 關閉時手機頁面的 JS（2026-11-21）

本節不是啟用條件，記錄合併後才發現的事實，避免再引用錯誤的結論。

- **量測**：合併前（`709c9fc`）與合併後（`f36ba39`）的 Production。
- **桌機**：解碼後 −0.01% 到 −0.42%。
- **手機**（Playwright iPhone 13 設定，不是實機）：
  - `/` +4.4 KB（+0.26%）；
  - `/regions/cs` +1.5 KB（+0.25%）；
  - `/learn` +1.6 KB（+0.19%）；
  - 其他頁面下降。
- **原因**：P9.8c 有約 1.3 KB 的小模組在 P9 關閉時仍在手機的載入路徑上，包括 root layout 的 `P9SharedStageSlot` 包裝、`canvasSlot`、`useFocusOnLoss` 與 loader。桌機多預取的一個 chunk 縮小了 4.6 KB，所以總量下降；手機不預取這個 chunk。
- **說法**：不得宣稱 P9 關閉時所有裝置的 JS 都沒有增加。
- **完整資料**：見 [P9_8C_SHARED_CANVAS_CS.md](P9_8C_SHARED_CANVAS_CS.md) 6.5 節。
- **狀態**：已記錄，未修正。是否另外處理由使用者決定。

## 5. 啟用步驟（全部由使用者決定，Agent 不得自行執行）

1. G1–G4、G7 在實機上完成並附證據（裝置、OS、瀏覽器版本、時間、失敗時的錄影）。
2. G5、G6 由使用者明確接受或要求修正。
3. 先在 Preview 以兩個旗標部署並重跑實機清單；Preview 受 Vercel 登入保護。
4. Production 啟用需另外授權；啟用後重新量測 Production JS 與 Console Errors，並保留關閉旗標的回復方式（移除變數後重新部署）。
