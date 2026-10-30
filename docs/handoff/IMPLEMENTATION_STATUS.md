# 實作與 Phase 狀態

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 狀態用語

| 標記 | 意義 |
|---|---|
| Implemented | 原始碼／資產實際存在，不能單憑此推定可執行 |
| Verified | 附有本輪執行證據；若僅為舊報告，明記「歷史報告 Verified」 |
| Partial | 部分已實作或驗證，仍有明確缺口 |
| Planned | 有規格／流程規劃，但沒有對應完成實作 |
| Blocked | 有明確阻擋原因，例如建置失敗或缺少批准 |
| Not Started | 未找到對應實作或執行證據 |

「實作」「測試」「人工批准」分開記錄；數字不以平均百分比包裝。

## 功能現況

| 功能 | 實作／驗證狀態 | 依據與缺口 |
|---|---|---|
| 六教材概念／三語範例 | Implemented；Python／C++ Verified；Java Partial | `src/content/courses.ts`；本輪六 Java skip |
| 純演算法快照引擎 | Implemented／Verified | `src/lib/engine.ts`；21 項引擎測試通過 |
| 共用播放器 | Implemented／Verified（jsdom）／Partial（瀏覽器） | `src/components/lab.tsx`；12 項 DOM 測試通過，實際 Web E2E 未跑 |
| 深淺主題／響應式／可存取性 | Implemented／Partial | 原始碼存在，無目前瀏覽器／WCAG 完整驗收 |
| Logic Islands（邏輯群島）原型 | Implemented／Partial／Blocked | `/islands`、三個 local geometry model；CSS 缺檔、型別與 lint 錯誤 |
| GLB 正式載入與功能節點路由 | **Implemented／Verified（分支 `phase-d/basics-glb`，D.1）**：只有基礎程式島 | `glb-island-model.tsx`、`glb-contract.ts`；工坊→`/learn`，燈塔／碼頭顯示說明，Anchor 只放標籤；載入失敗或契約缺失回到原創幾何。尚未 merge main，真機未測 |
| Hex World 六角聚落預覽（D.2a／D.2b 試作） | Implemented／Verified（分支） | `/islands/hex`，不連到網站導覽且設為 noindex；三座 7 格聚落、兩座橋與道路，地塊為程式生成。D.2b：基礎程式島改放 v2.1 GLB 的工坊、燈塔、碼頭與 3 棵樹，互動與 D.1 相同；第二階段改為 8 格連續地形（崖壁、坡道、低岸碼頭、GLB 粉彩配色）；另兩島仍是暫代幾何與獨立六角柱；正式 `/islands` 不讀取這份資料 |
| 原型整島 hover／click／聚焦 | Implemented、未實際驗證 | `island.tsx`／`camera-controller.tsx`；不是 GLB 子建物 click 整合 |
| v2.1 獨立 GLB viewer 三地標 Raycast | 歷史報告 Verified | 外部 `Polish_Browser_Validation.json`；與正式 R3F 系統分離 |
| 後端／登入／OJ／進度保存 | Not Started | 無對應 route／service／資料庫，不補猜產品計畫 |

## Phase 實作、驗證與批准分帳

| Phase | 檔案實況 | 驗證／人工批准 | 交接結論 |
|---|---|---|---|
| Phase 1 | 教材與播放器 Implemented | 本輪 45 passed／6 skipped；Java 與 Web E2E 未完成 | Partial；基礎邏輯已驗證，現有全站建置被後續原型阻擋 |
| Phase 2A | 三島 R3F 幾何原型 Implemented | 沒有對應 E2E；本輪 build／TS／lint 失敗 | Partial／Blocked，不標完成驗收 |
| Phase A | `LogicLab_Island_Pipeline_Validated.blend`＋`logiclab-test-island.glb` | 當日 GLB Validator 再驗證 0/0；歷史獨立 Three.js 成功 | Verified 技術管線；非正式美術 |
| Phase B | `LogicLab_3D_Art_Style_Guide.md`、`LogicLab_Basics_Island_Scene_Plan.md` | 兩文件存在且完整，後續模型依此製作 | Implemented（文件完成）；不表示所有模型與效能項目已達規格 |
| Phase C | `basics-v2/` 完整模型、渲染與 GLB | 使用者於對話給「有條件通過」；0/0 Validator，歷史 viewer 成功 | 製作完成候選；有人工條件，不等於 Phase D 授權 |
| Phase C.1 | **`basics-v2.1/` 實際已存在 BLEND、GLB、兩視圖、驗證與差異報告** | 本輪重新 Validator 0/0＋1 info；**2026-10-29 使用者正式批准 v2.1 為 Phase D 候選資產**（技術通過、視覺有條件接受） | Approved（有條件）；決議與後續美術項見 [ROADMAP](ROADMAP.md) |
| Phase D | D.0：runtime GLB、provenance、registry（`e4e7375`）；D.1：基礎程式島改用 GLB（`9c79937`）；D.2a：獨立的六角聚落預覽 `/islands/hex`（`063f0d4`）；D.2b 第一階段：預覽中的基礎程式島改用 GLB 建築（`c14e975`）；D.2b 第二階段：基礎程式島連續六角地形（方案 A2，`a63217d`）；島嶼尺度原型 `/islands/hex/scale/{19,37}`（`34276fe`）；37 格 Scale Refinement（`eeea613`）；37 格工坊入口道路（`fa3a9a9`）；D.2c-1 基礎程式島視覺改善試作（`f99f858`）；D.2c-2 渲染效能優化（commit「static shadow map, tree LOD and deep-sea frame for the 37-tile prototype (Phase D.2c-2)」）；D.3-0 正式版安全網與效能基準（commit「safety net and rendering baseline for the world map (Phase D.3-0)」）；D.3-1 統一場景設定（commit「unify the world map data and scene presets (Phase D.3-1)」）；D.3-2 共用 Explorer（commit「shared hex world explorer with the production safety net (Phase D.3-2)」）；D.3-3 Preflight 候選頁 `/islands/candidate` 與回退頁 `/islands/legacy`（commit「candidate and rollback routes for the world map switch (Phase D.3-3 preflight)」） | D.0 已驗收；D.1 工程整合已接受；D.2a 工程驗收通過；D.2b 第一階段技術驗收通過；第二階段 A2 視覺方向**未通過**，改做 19／37 格尺度原型；**2026-10-29 選定 37 格為優先基準**（19 格保留為參考），Scale Refinement 與工坊入口道路完成後 **D.2b 工程驗收通過**（`fa3a9a9`）。37 格的視覺美術未定案；D.2c-1 已試作（地表連續、中央廣場、主動線、地標構圖、鏡頭取景、沙灘與岩岸），**2026-10-30 視覺方向接受**；D.2c-2 渲染效能優化（靜態陰影貼圖、樹木 LOD、深海外框；四場景回到 D.2b 水準）**2026-10-30 驗收通過**；真機 GPU、觸控與 FPS 驗收留在 D.3；**2026-10-30 批准 D.3-0～D.3-2**（正式 `/islands` 不切換）；D.3-0～D.3-2 完成並接受；**2026-10-30 批准 D.3-3 Preflight**（正式 `/islands` 不變），已完成並有條件驗收通過（`72e3eb6`），**正式切換未批准**；**D.3-4 真機驗收準備已完成**（量測工具 `perf/device/`、驗收表 [DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)），2026-10-30 起 D.3-4 分為 **D.3-4A：Automated Acceptance Passed**（限已執行的自動化項目）與 **D.3-4B：Not Measured**（iPhone SE 第 3 代、iPhone 16、中階 Android）；iOS Safari／Screen Reader：Not Verified，**D.3-4 整體未判定**；B 不阻擋其他階段，正式切換仍需另行批准；其他兩島的遷移、後續美術擴充、D.3 未批准 | Partial；分支未 merge、未 push，見 [ROADMAP](ROADMAP.md) 與 [TESTING_STATUS](TESTING_STATUS.md) |
| Phase E | Data-Driven Islands（schema 定義島嶼、GLB 引用、課程、互動、解鎖、關聯） | 無實作 | Planned；D 完成後才開始，見 [ROADMAP](ROADMAP.md) |
| Phase F | RPG Learning System（NPC、任務、EXP、等級、徽章、解鎖） | 無實作 | Planned；依賴 E，進度層與 3D 層分離 |
| Phase G | APCS Challenges（試煉島、中央島、跨島任務、完成紀錄） | 無實作 | Planned；依賴 F，判題 adapter 預留自動判題擴充，首版方式待決 |
| Phase H | AI 群島課程規劃、知識依賴、AI-01～AI-06 島嶼設定、schema 擴充 | 無實作 | Proposed／Planned；依賴 E（任務整合需 F）；三項架構決議已定，見 ROADMAP |
| Phase I | 互動式 AI 實驗室、模型展示、資料視覺化、運算服務規劃 | 無實作 | Proposed／Planned；依賴 H，瀏覽器優先 |
| Phase J | AI 專題挑戰、跨島任務、學習成果展示 | 無實作 | Proposed／Planned；依賴 I、F，重用 G 判題格式 |

### C.1 不一致如何處理

> 2026-10-29 更新：此不一致已由使用者決議解除，v2.1 有條件批准為 Phase D 候選；以下段落保留為當時的處理紀錄。

不能把 `basics-v2.1/` 說成不存在或尚未完成製作，也不能用檔案存在推定人工批准。歷史對話包含 v2.1 Final Art Polish 的執行請求與回報；本次指示將其列為「尚未批准執行」。後者是**目前操作限制**，故下一個 Agent 應先呈交現存 v2.1 證據，請使用者決定「採用候選／補驗收／撤回」，不要重跑模型腳本或擅自進 D。檔案不會證明批准，對話也不能替代當前建置結果。

## Git 與工作目錄

- `.git` 不存在；`git rev-parse --show-toplevel`、`git status --short --branch`、`git log -1`、`git remote -v` 均回報 not a git repository。本輪未 init、checkout、reset、clean、commit、push。
- 分支／HEAD commit／remote／未提交變更／未追蹤檔案：**無法以 Git 定義核對**。不是「乾淨工作樹」，也不是把所有檔案虛稱 untracked。
- 本輪前後來源 SHA-256 對照在 `evidence/source-before.json`、`evidence/source-protection.json`；這只是檔案 checkpoint，不是 Git 歷史。
- `.gitignore` 只列 node_modules、.next、out、*.tsbuildinfo、.DS_Store、test-results、playwright-report。沒有 `.env*` 或大型資產策略；當前無 env 檔，不代表未來適合直接 add 全部。
- `.gitattributes` 不存在，未找到 Git LFS；正式 Blender／GLB 尚在 Codex 私有目錄，未移入專案；根目錄也沒有 public/。
- `.next` 約 298 MiB，包含舊 BUILD_ID 與沒有 `/islands` 的 prerender manifest。保留原樣，不能用來證明新原始碼可建置。
- 本輪只允許修改 `docs/handoff/` 與新增根 `CLAUDE.md`，原始程式、套件與資產均未修改。最後差異清單見 `evidence/source-protection.json`。

## README 的時效

`README.md` 的 2026-10-28 lint/build 通過、45 passed／6 skipped 與後續 Phase 2 尚未開始，是較早的階段紀錄；原始碼已出現 `/islands`，且本輪 lint／TS／build 失敗。保留 README 不改寫歷史，以本交接證據作目前狀態。不將歷史的瀏覽器權限拒絕推定成今天仍有相同政策；本輪 Web E2E 因 build 阻擋未啟動。
