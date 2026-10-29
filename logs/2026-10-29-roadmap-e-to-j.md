# 2026-10-29 Roadmap E–J 與雙群島架構

## 1. Phase D 規劃（只規劃）

- 範圍：基礎程式島改用 v2.1 runtime GLB，其餘兩島、教材、引擎不變。
- 計畫要點：
  - runtime GLB 是衍生檔：移除 `blendermcp_server_running`，BIN chunk 不變。
  - registry 新增 `glb` 來源型別，記錄 version／sha256。
  - `useGLTF(url, false)`，不使用 gstatic 上的 Draco decoder。
  - 載入失敗時 fallback 回原創幾何。
  - 互動以 `userData.interaction_id` 解析；文字用 HTML 標籤顯示。
- 詳細審查見 [2026-10-29-phase-d-pre-review.md](2026-10-29-phase-d-pre-review.md)。

## 2. Phase E／F／G（Planned）

- 編號：既有數字序列（1／1.1／2A）與字母序列（A–D）並存；E 之後接續字母序列，不用 Phase 3、4。
- E Data-Driven Islands → F RPG Learning System → G APCS Challenges。
- 要求：
  - E 相容 `interaction_id`／Anchor／Node Contract；
  - F 進度層與 3D 渲染層分離；
  - G 判題以 adapter 隔離，保留程式碼自動判題擴充。

## 3. 產品方向與 Phase H／I／J（Proposed／Planned）

- 產品方向：程式設計、資料結構、演算法與人工智慧的互動式學習世界。
- 雙群島：Coding Archipelago（八座程式島）與 AI Archipelago（AI-01～AI-06），共用同一套 R3F、Phase E schema、Phase F 進度系統。
- H 課程規劃與 schema 擴充 → I 互動實驗室與運算服務（瀏覽器優先）→ J 專題挑戰與成果展示。
- 三項架構決議：
  1. Python 基礎教材歸 Coding Archipelago，AI 課程只引用必要單元。
  2. AI 島程式 ID 用小寫 kebab-case，AI-01～AI-06 僅顯示編號。
  3. AI 教材為獨立內容模組，共用既有課程型別、播放器與進度介面。

## 4. 提交紀錄

| Commit | 內容 |
|---|---|
| `573a652` | docs: establish Logic Island roadmap phases E-J（新增 ROADMAP，更新 5 份 handoff 文件） |
| `f45c867` | docs: mark Phase C.1 conditionally approved in handoff records（NEXT_STEPS 舊問句、CLAUDE_HANDOFF、BLENDER_ASSET_INVENTORY 註記） |

兩個 commit 已正常 push 至 `origin/main`（`80d54ee..f45c867`），未 force push。
