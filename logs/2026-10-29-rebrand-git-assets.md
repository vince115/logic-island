# 2026-10-29 更名、Git 初始化與資產保全

## 1. 品牌更名 LogicLab → Logic Island

- 授權：更新品牌文字、metadata、導覽、README、CLAUDE.md、docs 與 package 名稱；不批次取代、不改教材／引擎／R3F 結構／Blender 資產／歷史檔名；不部署、不推送。
- 變更：
  - `src/app/layout.tsx`：`applicationName: 'Logic Island'`，title `Logic Island — 程式邏輯島`，template `%s | Logic Island`；footer 改為 Logic Island。
  - `src/components/header.tsx`、`src/app/page.tsx`：品牌文字與 aria-label；首頁徽章「程式邏輯島」。
  - `package.json` name 改為 `logic-island`（lockfile root importer 為 `.`，不需改）。
  - README、CLAUDE.md、交接文件的品牌與根路徑。
- 刻意保留：`localStorage` key `logiclab-theme`、Blender／GLB 檔名（`LogicLab_*`、`logiclab-*`）、`asset_id`、歷史 evidence。
- 問題與修正：
  - root metadata 的 openGraph 讓課程頁繼承首頁 og:description，已移除 openGraph。
  - `pkill` 沒殺到 `next-server`，舊 build 仍在服務；以 `lsof` 找 PID 結束後重驗。

## 2. 群島命名

- `/islands` 標題與 ARIA 由 Learning Islands 改為 **Logic Islands · 邏輯群島**（使用者中途將「學習群島」更正為「邏輯群島」）。
- 涉及 `src/app/islands/page.tsx`、`islands-explorer.tsx`、`island-scene.tsx`、`islands.module.css` 註解，以及 ARCHITECTURE／IMPLEMENTATION_STATUS／PROJECT_OVERVIEW。

## 3. 驗證（隔離副本）

隔離副本以 rsync（排除 node_modules、.next）＋ `cp -cR node_modules` 建立，避免污染工作目錄：

- `node node_modules/eslint/bin/eslint.js .`：0 errors
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：通過
- `node node_modules/vitest/vitest.mjs run`：45 passed／6 skipped（Java 無 JDK）
- `next build`：18 pages
- `/islands` 與 12 條教材路由回應 200

## 4. Git 初始化

- 授權：在 main init、單一 Initial Commit、設 origin、正常 push（不 force）；遠端有歷史／備份不完整／發現秘密則停止。
- `.gitignore` 加入 env／憑證／log／暫存與 `*.blend*` 排除。
- Commit `80d54ee`（Initial commit: Logic Island v0.1），73 個檔案，push 至 `https://github.com/vince115/logic-island.git`。

## 5. Blender 資產保全

- 81 個 Codex 產出檔複製到 `/Users/vincelo/dev-hub/assets/logic-island/codex-visualizations-20261028-01a181a6/`，保留目錄結構，不加入 Git。
- 共 19,735,358 bytes；`MANIFEST.json` 與 `SHA256SUMS` 逐檔記錄 bytes、SHA-256、用途與候選狀態。
- 驗證：81/81 SHA 相符；Phase A 7/7、v2 19/19、v2.1 22/22 與各自 Delivery Manifest 相符；Codex 原檔未改動。
- 保全庫 `README.md` 仍寫 v2.1「待人工確認批准」，屬 D.0 文件同步，尚未修改。

## 6. Phase C.1 美術審查與批准

- 只分析、不改模型。
- v2.1 相較 v2 的改善：
  - 加入 `</>` 與 START 標記；
  - 屋頂寬度調整；
  - 前景植栽增加；
  - 共面配對由 384 降到 113。
- 仍未改善：
  - 屋頂量感、前平台與崖面分層、峽谷；
  - 手機上文字難以辨識；
  - 沒有 LOD／AO，也沒有真機測試。
- 新發現：
  - scene extras 帶 `blendermcp_server_running`；
  - root `asset_id` 仍是 v2。
- 使用者決議：v2.1 有條件批准為 Phase D 候選，七項條件全文見 [ROADMAP](../docs/handoff/ROADMAP.md)。
