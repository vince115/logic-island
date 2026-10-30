# 開發紀錄（logs）

依日期記錄每輪工作的指示範圍、實際變更、驗證證據與待決事項。這裡是**過程紀錄**；目前狀態與批准以 `docs/handoff/` 為準（尤其 [ROADMAP](../docs/handoff/ROADMAP.md)、[IMPLEMENTATION_STATUS](../docs/handoff/IMPLEMENTATION_STATUS.md)）。

| 檔案 | 內容 |
|---|---|
| [2026-10-29-rebrand-git-assets.md](2026-10-29-rebrand-git-assets.md) | 更名 Logic Island、命名一致性、Git 初始化、81 個 Blender 資產保全、C.1 美術審查與批准 |
| [2026-10-29-roadmap-e-to-j.md](2026-10-29-roadmap-e-to-j.md) | Phase D 規劃、Roadmap E–J 與雙群島架構、文件 commit 與 push |
| [2026-10-29-phase-d-pre-review.md](2026-10-29-phase-d-pre-review.md) | Phase D 實作前審查：v2.1 GLB 對照 C.1 七項條件、節點契約、修改範圍、步驟、測試與回滾 |
| [2026-10-29-hex-world-analysis.md](2026-10-29-hex-world-analysis.md) | 六角聚落世界架構分析：GLB 可重用範圍、方案 A／B／C 比較、A＋ 決議與 D.2 拆分 |
| [2026-10-29-phase-d2a-hex-world.md](2026-10-29-phase-d2a-hex-world.md) | D.2a 六角聚落預覽：hex 座標、橋樑資料、修改檔案與驗證 |
| [2026-10-29-phase-d2b-trial.md](2026-10-29-phase-d2b-trial.md) | D.2b 第一階段試作：基礎程式島 GLB 建築上六角地塊、Anchor 相對位移、互動與 fallback、風格問題 |
| [2026-10-29-d2b-visual-analysis.md](2026-10-29-d2b-visual-analysis.md) | D.2b 視覺改善分析：實測數據、A1／A2／B 比較、A2 決議 |
| [2026-10-29-phase-d2b-terrain.md](2026-10-29-phase-d2b-terrain.md) | D.2b 第二階段：基礎程式島連續六角地形、跨格工坊、低岸碼頭、手機名牌 |
| [2026-10-29-island-scale-prototype.md](2026-10-29-island-scale-prototype.md) | 島嶼尺度與世界構圖原型：19／37 格配置、比較表、效能拆解、待決事項 |
| [2026-10-29-d2b-scale-refinement.md](2026-10-29-d2b-scale-refinement.md) | 37 格 Scale Refinement：碰撞代理、HTML 地點入口、道路與橋樑合併、前後效能實測 |
| [2026-10-29-d2b-workshop-road.md](2026-10-29-d2b-workshop-road.md) | 分功能 commit 紀錄；工坊入口方向（GLB 實測）、工坊位置調整、入口道路與道路網驗證 |
| [2026-10-29-d2c1-composition.md](2026-10-29-d2c1-composition.md) | D.2c-1 基礎程式島視覺改善試作：地表連續、中央廣場、主動線、地標構圖、鏡頭取景、沙灘與岩岸、效能 A/B 與成本拆解（視覺方向已接受，`f99f858`） |
| [2026-10-30-d2c2-performance.md](2026-10-30-d2c2-performance.md) | D.2c-2 渲染效能優化：可重現的四場景基準（SwiftShader／Metal）、成本拆解、靜態陰影貼圖、樹木 LOD、深海外框、前後畫面逐像素比對（2026-10-30 驗收通過） |
| [2026-10-30-d3-0-baseline.md](2026-10-30-d3-0-baseline.md) | D.3-0 正式版安全網與效能基準：清單模式、Error Boundary、WebGL 失效、BFS 入口的 E2E；世界資料指紋；可重現的效能量測方法、正式版與 37 格的基準、依島拆分的 draw call、建議門檻 |
| [2026-10-30-d3-1-scene-presets.md](2026-10-30-d3-1-scene-presets.md) | D.3-1 統一場景設定：37 格正式資料與 19 格原型分離、具名 scene preset、量測探針改為延遲載入；畫面逐像素不變 |
| [2026-10-30-d3-2-shared-explorer.md](2026-10-30-d3-2-shared-explorer.md) | D.3-2 共用 Explorer：場景只負責 3D，Explorer 負責清單模式、Error Boundary、WebGL 失效、地點清單與導航；安全網對照、3D 畫面逐像素不變、D.3-3 切換風險 |
| [2026-10-30-d3-3-preflight.md](2026-10-30-d3-3-preflight.md) | D.3-3 Preflight：隱藏的候選頁 `/islands/candidate`（正式 preset 與文案、hover、手機單行工具列）與回退頁 `/islands/legacy`；Skip Link 驗證、渲染成本對照、D.3-4 真機驗收規格草案 |
| [2026-10-30-d3-4-prep.md](2026-10-30-d3-4-prep.md) | D.3-4 真機驗收準備：Mac 上的量測 proxy（自動對照量測、雙指縮放計時、故障注入、人工檢查表、報告）、與桌機 harness 共用的量測定義、驗收表與方法、工具自我檢查與桌機 Safari dry-run；尚未在實體裝置執行 |
| [2026-10-30-d3-integration-analysis.md](2026-10-30-d3-integration-analysis.md) | D.3 整合方案分析：正式 `/islands` 與 37 格原型的差異、共用與原型專用程式、單一渲染器、契約與 fallback、驗收標準、分階段施工、風險與回退（只分析，未改程式） |
| [../docs/handoff/SCENE_MODULES.md](../docs/handoff/SCENE_MODULES.md) | 2026-10-29 模組化 3D 場景架構規劃（12 模組、藍圖、驗證、D／E／F 分層；只規劃） |

## 撰寫規則

- 繁體中文；技術名稱、路徑、指令、commit hash 保持原文。
- 每篇寫明：授權範圍、做了什麼、證據（指令輸出、SHA、hash）、沒做什麼、待決事項。
- 不寫入 API Key、Token、密碼等秘密值。
- 不改寫舊紀錄；狀態變更另寫新篇或在文末加日期註記。
