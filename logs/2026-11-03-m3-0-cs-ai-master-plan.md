# 2026-11-03 M3.0 資訊科學＋人工智慧群島世界規劃

## 指示範圍

- 只做架構、課綱對照、世界 Layout、GLB 美術方向與實作 Roadmap，不開始 3D 建模。
- 不修改 Production 3D World、現有 GLB、Curriculum ID／slug／進度 key、四時段 Theme、受保護的原型路由；不新增第二套 World Registry；不 Push、Merge、Deploy。
- 文件 commit 須獨立，不含其他 Session 的變更。

## 起點

- `phase-d/basics-glb` @ `c560142`（與預期相同）。
- Theme Session 的 5 個未提交檔案與 `.claude/` 仍在工作樹。
  - 本次沒有修改、還原或提交它們；MD5 與 F.1e（原稱 F.2）開始時記錄的相同。

## 盤點依據

- `src/content/world/islands.ts`：15 座學科島＋互動實驗島、regions `cs`／`ai`。
- `docs/planning/data/curriculum-blueprint.json`：320 堂；完整 80 堂。
- `docs/planning/data/learning-paths.json`：6 條路線。
- `src/lib/islands/islands-world.ts`：首頁 5 島的座標與橋。
- `public/models/islands/basics-island.v2.1.glb`：直接讀 GLB JSON，確認 2 個材質（頂點顏色調色盤、`KHR_materials_emissive_strength` 發光）、24 個 mesh、extras 契約。
- `docs/assets/*.json`、`scripts/assets/derive-runtime-glb.mjs`、`tests/islands-glb.test.ts`（sha256 比對）。

## 產出

- 新增 `docs/planning/M3_CS_AI_MASTER_PLAN.md`：
  - 盤點；
  - CS 七大領域對照：SPM → SA 島內單元；PL 與 F 不重複，只在 F15／PL06 交界；
  - AI 候選主題對照：NLP、CV 沒有獨立島；
  - 島嶼數量維持 15；
  - Single World／Regional World 比較，推薦 Regional World；
  - 兩區 Hex Layout 草案，以六角距離檢查新島中心距離 ≥ 9；
  - 學習路線對照；
  - M3.0–M3.6 Roadmap；
  - 12 項待批准決策。
- 新增 `docs/planning/ARCHIPELAGO_GLB_ART_DIRECTION.md`：
  - 區域識別；
  - CS 8 座、AI 7 座的美術方向；
  - 共用 GLB 管線：命名、材質、anchors、provenance、SHA、lazy loading、fallback、回歸測試；
  - 暫定預算。
- 指標更新：
  - `WORLD_EXPANSION_ARCHITECTURE`、`ISLAND_TAXONOMY`、`LEARNING_PATHS`、`PHASE_F_ROADMAP`、`MULTI_ARCHIPELAGO_MASTER_PLAN`（文件地圖）；
  - `IMPLEMENTATION_STATUS`、`NEXT_STEPS`。

## 沒有做

- 程式、測試、資料檔、GLB、BLEND 都沒有修改。
- 沒有執行 build 或 E2E：本次只改文件；唯一讀 `docs/planning` 的測試讀的是沒變的資料 JSON。
- Hex Layout 草案只做了六角距離計算，沒有跑 `validateHexWorld`，也沒有截圖。這兩項屬 M3.1。

## 2026-11-03 後續：有條件批准與 M3.1 架構提案

使用者有條件批准 M3.0（決策紀錄見 `docs/planning/M3_CS_AI_MASTER_PLAN.md` §10）。

### 調整項

- `/` 不切換，新世界以 feature flag 建立；
- 資料庫島 3D 整合歸檔為 **F.1e**，F.2 保留給 AI 教材；
- 先完成 M3.1 驗證再進入 M3.2 建模；
- 效能預算只是暫定目標；
- Blender MCP 先查相容性，不直接改環境。

### 文件更新

- M3.0、ART_DIRECTION、PHASE_F_ROADMAP、handoff 文件中，指資料庫島 3D 整合的「F.2」都改為 F.1e。
- commit 訊息、程式註解與 log 檔名不改寫。

### 隔離副本的計算（`f2/after`，src 與 HEAD 相同；腳本不在 repo）

- **Layout**：以 `validateHexWorld` 驗證兩區草案，0 問題，島間至少 2 格水。
  - PL 由 (−9, 1) 西移到 (−10, 1)：原位置與 F 只隔 1 格水。
  - 搜尋到的 DB–SA 港口落在 DB 的平台格，緊鄰主塔，待 M3.1 重選。
- **鏡頭**：以 `hex-camera.tsx` 的取景公式計算，區域總覽的縮放約為現在 5 島首頁的 48–51%（桌機與手機）。
  - 手機以最佳方位角可回到 66–73%。

### 新增

- `docs/planning/M3_1_REGIONAL_WORLD_ARCHITECTURE.md`

### 沒有做

- 任何程式、路由、測試、GLB 的修改；
- build、E2E 或效能量測。
