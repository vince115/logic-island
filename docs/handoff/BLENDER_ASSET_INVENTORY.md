# Blender 與 3D 資產完整盤點

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 來源、完整性與搬移原則

資產根目錄（實際存在）：`/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/`。

本輪共盤點 **81 個一般檔案**：7 BLEND、3 GLB、17 PNG、6 Markdown、30 JSON、9 Python、6 MJS、3 HTML。排除 node_modules／.git 與 symlink；不把第三方套件當自有資產。每檔完整路徑、bytes、SHA-256 在 [機器可讀清單](evidence/asset-inventory.json)，下表逐項補上用途、版本、候選／驗證／限制／搬移判斷。檔案名稱已包含在完整路徑中。

**這些資產目前不在 Logic Island repo、public 也不存在。** 本輪僅建立文件，沒有搬移、刪除、修改 BLEND／GLB／PNG。未來換機需按 hashes 複製；不得只帶 GLB 卻遺漏規格、源模型、接合例外與原始驗證資料。

## Blender MCP 現況（本輪只讀）

- `get_addon_status` 與 `get_scene_info` 成功，Blender **5.2.2 LTS**；addon **1.8**，protocol **14**／server 預期 **15**，up_to_date=false。
- 開啟檔是 `basics-v2.1/LogicLab_Basics_Island_v2.1.blend`，場景名稱仍為 `Basics_Island_v2`。24 Mesh、22 Empty、1 camera、3 light，1600×900；不能由 scene 名猜檔案版本。
- polyhaven／sketchfab／polypizza、3D generators 都為 off；telemetry_consent=false。本輪不啟用服務、升級外掛或重啟場景。
- [本輪原始 MCP 結果](evidence/blender-current.json)。Claude Code 需要自己的 MCP 連線設定；Codex 可用不保證 Claude 自動可用。
- glTF 動態格式 API 的歷史問題：RNA enum_items 空清單曾導致 StopIteration。Phase A 讀取 Blender 5.2 內建 io_scene_gltf2 的 get_format_items callback 後正常匯出；這是該安裝版本的實作，升級需再驗證。

## 主要資產選版

| 系列 | 核心檔／用途 | 候選與限制 |
|---|---|---|
| v1／初始測試 | LogicLab_Test_Island.blend，Art_QA副本，備份 | 技術參考，平坦地形／法線問題記錄，非正式美術候選 |
| Phase A 修復 v1 | LogicLab_Island_Pipeline_Validated.blend＋logiclab-test-island.glb | GLB管線基準，882tri／49nodes／15mats，非採用美術 |
| v2／Phase C | basics-v2/LogicLab_Basics_Island_v2.blend＋GLB | 9,324tri／43nodes／2mats／21calls；使用者人工有條件通過，仍有接合例外 |
| v2.1／Phase C.1 | basics-v2.1/LogicLab_Basics_Island_v2.1.blend＋GLB | 9,800tri／46nodes／2mats／24calls；實際已製作，人工狀態與本次指示不一致，**保留候選待確認，不擅自採用** |
| 規格 | LogicLab_3D_Art_Style_Guide.md、LogicLab_Basics_Island_Scene_Plan.md | 精緻low-poly、三層地形、燈塔／工坊／碼頭／航道、互動契約與預算；文件完成不等於所有驗收完成 |

三 GLB 本輪重新 validateBytes：全 0 errors／0 warnings；v2.1 有1 unused UV info。原有 Validator／Three.js報告皆存在且manifest比對無差異。Three.js部分本輪只核對舊報告，未重跑renderer；來源限制見 [測試狀態](TESTING_STATUS.md)。

## 互動契約與正式資產差異

正式候選根 `Island_Basics_Root`，穩定主節點 `Landmark_Lighthouse`、`Building_Workshop`、`Dock_Entry`、Tree_001–005、四個Anchor；extras帶 role／interaction_id，工坊帶 route=/learn。v2.1在原43節點上新增3Mesh，歷史Node_Contract報告顯示原父子／Transform無變更；本輪直接GLB JSON也確認上述節點與extras存在。

`lighthouse`／`learn`／`entry` 是互動ID，不等於三份教材已建路由。現有R3F原型以foundations／structures／algorithms選整島，沒有讀上述GLB節點；Phase D需另接。輔助group suffix不可作程式契約。

Style Guide目標包括根原點、1 unit=1m、Y up GLB、6–8材質（最多10）、手機≤25calls、LOD0約12k–20ktri、LOD1／LOD2、AO及真機效能。v2.1目前2材質／24calls、9.8ktri，低於預估面數並非缺陷，但沒有LOD／AO atlas／真機測試；畫面仍有屋頂重量與縮圖文字限制。GLB尺寸約X10.62×Y高9.77×Z8.56m，不可套原型手填bounds。

共面例外：v2.1原始strict判定false，113組三角形配對、兩視角可見同向配對0。副本用小於0.5mm製造公差與最大0.35mm接合淺浮差處理外露面；不是所有裝置／角度零Z-fighting保證。本輪不修改這些幾何，例外JSON與資產綁定保存。

## 81 檔逐項清單

「搬移」均指未來**複製**建議，本輪未執行。只有選定GLB需要runtime資產路徑；BLEND保留來源／LFS或經核准儲存，PNG／規格／報告放docs或同等可移交位置。過程腳本不能直接重跑。

| 完整路徑（含檔名） | bytes | 版本／用途 | 正式候選 | 驗證與已知限制 | 未來搬移 |
|---|---:|---|---|---|---|
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_3D_Art_Style_Guide.md` | 16,475 | Phase B：跨島美術語言／節點／效能規格 | 正式規格參考 | 已閱讀；報告結論有時效，批准以目前任務為準 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Basics_Island_Scene_Plan.md` | 5,184 | Phase B：基礎島場景配置／建模工作拆分 | 正式規格參考 | 已閱讀；報告結論有時效，批准以目前任務為準 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_GLB_Validation_Report.md` | 10,006 | v1／A–B：驗收報告／交付說明 | 否（證據／輔助） | 已閱讀；報告結論有時效，批准以目前任務為準 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Island_Art_QA.blend` | 138,806 | v1／A–B：源模型／工作副本 | 否（備份／技術參考） | 檔案存在／hash；未重新載入；保留來源場景與接合限制 | 保留源模型；選定後經核准複製＋二進位版本管理 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Island_Art_QA_1600x900.png` | 1,294,723 | v1／A–B：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Island_Art_QA_Report.md` | 7,791 | v1／A–B：驗收報告／交付說明 | 否（證據／輔助） | 已閱讀；報告結論有時效，批准以目前任務為準 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Island_Pipeline_Validated.blend` | 140,930 | v1／A–B：源模型／工作副本 | 否（備份／技術參考） | 檔案存在／hash；未重新載入；保留來源場景與接合限制 | 保留源模型；選定後經核准複製＋二進位版本管理 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Island_QA_audit.json` | 30,371 | v1／A–B：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_Test_Island.blend` | 141,735 | v1／A–B：源模型／工作副本 | 否（備份／技術參考） | 檔案存在／hash；未重新載入；保留來源場景與接合限制 | 保留源模型；選定後經核准複製＋二進位版本管理 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/LogicLab_before_island_20261028_163626_505264.blend` | 98,050 | v1／A–B：修改前備份 | 否（保全） | 檔案存在／hash；未重新載入；保留來源場景與接合限制 | 保留來源備份，不放runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_Blender_Audit.json` | 18,143 | v1／A–B：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_Browser_Validation.json` | 1,458 | v1／A–B：歷史Three.js／Raycast報告 | 否（證據／輔助） | 已解析；Headless／SwiftShader＋手機視窗，非正式R3F／真機 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_Delivery_Manifest.json` | 1,020 | v1／A–B：交付檔案hash清單 | 否（證據／輔助） | 本輪與實際檔案比對無hash差異；不代表人工批准 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_GLB_Audit.json` | 30,710 | v1／A–B：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_Khronos_Validation.json` | 948 | v1／A–B：歷史Khronos原始結果 | 否（證據／輔助） | 已解析；與本輪GLB再驗證分開記錄 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_ThreeJS_desktop.png` | 52,425 | v1／A–B：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/PhaseA_ThreeJS_mobile.png` | 30,506 | v1／A–B：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸390×844已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/Before_PhaseC.blend` | 140,976 | v2／C：修改前備份 | 否（保全） | 檔案存在／hash；未重新載入；保留來源場景與接合限制 | 保留來源備份，不放runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C1.py` | 8,317 | v2／C：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C1_Composition.png` | 1,496,808 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C2.py` | 5,386 | v2／C：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C2_Architecture.png` | 1,586,760 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C3.py` | 4,856 | v2／C：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C3_Environment.png` | 1,642,361 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C4_Alternate_View.png` | 1,607,411 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C4_C5.py` | 3,410 | v2／C：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C4_Final_1600x900.png` | 1,652,016 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C4_Main_Return.png` | 1,651,834 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_Blender_Audit.json` | 3,500 | v2／C：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_Browser_Validation.json` | 1,460 | v2／C：歷史Three.js／Raycast報告 | 否（證據／輔助） | 已解析；Headless／SwiftShader＋手機視窗，非正式R3F／真機 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_Final_1600x900.png` | 1,581,529 | v2／C：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_GLB_Audit.json` | 19,227 | v2／C：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_Khronos_Validation.json` | 955 | v2／C：歷史Khronos原始結果 | 否（證據／輔助） | 已解析；與本輪GLB再驗證分開記錄 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_ThreeJS_desktop.png` | 115,043 | v2／C：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/C5_ThreeJS_mobile.png` | 55,253 | v2／C：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸390×844已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/Delivery_Manifest.json` | 2,609 | v2／C：交付檔案hash清單 | 否（證據／輔助） | 本輪與實際檔案比對無hash差異；不代表人工批准 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/LogicLab_Basics_Island_v2.blend` | 335,226 | v2／C：源模型／工作副本 | 人工條件通過源候選 | 檔案存在／hash；未重新載入；保留來源場景與接合限制 | 保留源模型；選定後經核准複製＋二進位版本管理 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/LogicLab_Basics_Island_v2_Art_Review.md` | 7,575 | v2／C：驗收報告／交付說明 | 否（證據／輔助） | 已閱讀；報告結論有時效，批准以目前任務為準 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/browser-console.json` | 1,461 | v2／C：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/logiclab-basics-island-v2.glb` | 828,192 | v2／C：GLB輸出 | 人工條件通過候選 | 本輪Validator 0 error／0 warning／0 info；9324tri；接合例外／非真機 | 選定後複製至runtime資產目錄；不全部納入 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/refine.py` | 1,942 | v2／C：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/validation-console.json` | 4,143 | v2／C：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/viewer/browser-test.mjs` | 2,045 | v2／C：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/viewer/index.html` | 3,866 | v2／C：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2/viewer/validate.mjs` | 5,494 | v2／C：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Blender_Audit.json` | 3,554 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Construction_Clearances.json` | 17,798 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Coplanar_Exceptions_and_Acceptance.json` | 3,217 | v2.1／C.1：共面／Z-fighting抽樣與例外 | 否（證據／輔助） | 已核對；strict仍false或接觸配對存在，不一律刪面 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Coplanar_Visibility_Details.json` | 43,053 | v2.1／C.1：共面／Z-fighting抽樣與例外 | 否（證據／輔助） | 已核對；strict仍false或接觸配對存在，不一律刪面 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Delivery_Manifest.json` | 3,085 | v2.1／C.1：交付檔案hash清單 | 否（證據／輔助） | 本輪與實際檔案比對無hash差異；不代表人工批准 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Junction_Relief.json` | 782 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/LogicLab_Basics_Island_v2.1.blend` | 364,247 | v2.1／C.1：源模型／工作副本 | 待確認批准的源候選 | MCP目前開啟此檔；尚未對齊人工批准；非runtime | 保留源模型；選定後經核准複製＋二進位版本管理 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/LogicLab_Basics_Island_v2.1_Review.md` | 6,564 | v2.1／C.1：驗收報告／交付說明 | 否（證據／輔助） | 已閱讀；報告結論有時效，批准以目前任務為準 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Node_Contract_Validation.json` | 174 | v2.1／C.1：節點／Pivot／extras契約證據 | 否（證據／輔助） | 已核對記錄；不是網站互動整合測試 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Polish_Browser_Validation.json` | 3,796 | v2.1／C.1：歷史Three.js／Raycast報告 | 否（證據／輔助） | 已解析；Headless／SwiftShader＋手機視窗，非正式R3F／真機 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Polish_GLB_Audit.json` | 18,816 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Polish_Khronos_Validation.json` | 1,149 | v2.1／C.1：歷史Khronos原始結果 | 否（證據／輔助） | 已解析；與本輪GLB再驗證分開記錄 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Polish_Mobile_Sign_Detail.png` | 76,320 | v2.1／C.1：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸390×844已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Polish_ThreeJS_desktop.png` | 117,002 | v2.1／C.1：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Polish_ThreeJS_mobile.png` | 56,507 | v2.1／C.1：獨立WebGL／手機視窗截圖 | 否（證據／輔助） | PNG標頭尺寸390×844已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Roof_Adjustment.json` | 1,155 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/Source_Protection.json` | 338 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/browser-console.json` | 3,797 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/finish.py` | 2,311 | v2.1／C.1：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/junction_relief.py` | 2,096 | v2.1／C.1：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/logiclab-basics-island-v2.1.glb` | 879,748 | v2.1／C.1：GLB輸出 | 待確認批准的候選 | 本輪Validator 0 error／0 warning／1 info；9800tri；接合例外／非真機 | 選定後複製至runtime資產目錄；不全部納入 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/polish.py` | 7,033 | v2.1／C.1：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/seams.py` | 1,939 | v2.1／C.1：歷史Blender製作／修復腳本 | 否（證據／輔助） | 未執行；可能新增／覆蓋工作模型，禁止當續作腳本盲跑 | 可保留過程參考；不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/v2.1_Alternate_1600x900.png` | 1,631,147 | v2.1／C.1：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/v2.1_Main_1600x900.png` | 1,584,160 | v2.1／C.1：過程／最終渲染 | 否（證據／輔助） | PNG標頭尺寸1600×900已核對；視覺證據不等於真機測試 | 選定版預覽複製至文件，不作模型runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/v2_Node_Contract.json` | 11,723 | v2.1／C.1：節點／Pivot／extras契約證據 | 否（證據／輔助） | 已核對記錄；不是網站互動整合測試 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/validator-console.json` | 2,744 | v2.1／C.1：驗證／契約／追蹤資料 | 否（證據／輔助） | 已確認存在與hash；不是功能／美術驗收 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/viewer/browser-test.mjs` | 2,241 | v2.1／C.1：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/viewer/index.html` | 5,055 | v2.1／C.1：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/basics-v2.1/viewer/validate.mjs` | 7,263 | v2.1／C.1：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/logiclab-test-island.glb` | 74,336 | v1／A–B：GLB輸出 | 否（技術基準） | 本輪Validator 0 error／0 warning／0 info；882tri；接合例外／非真機 | 選定後複製至runtime資產目錄；不全部納入 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/pipeline-test/browser-test.mjs` | 2,043 | v1／A–B：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/pipeline-test/index.html` | 3,865 | v1／A–B：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/pipeline-test/package-lock.json` | 1,750 | v1／A–B：外部viewer測試工具版本 | 否（證據／輔助） | 僅viewer依賴，不是Logic Island根套件 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/pipeline-test/package.json` | 122 | v1／A–B：外部viewer測試工具版本 | 否（證據／輔助） | 僅viewer依賴，不是Logic Island根套件 | 按選版複製交接資料，不作runtime |
| `/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/pipeline-test/validate.mjs` | 5,492 | v1／A–B：獨立Three.js／Validator測試環境 | 否（證據／輔助） | 本輪僅讀；Mac Chrome絕對路徑／node_modules依賴需移機調整 | 選版後複製測試程式，依賴另裝；不是正式網站 |

## 此輪實際執行與未做的事

只呼叫MCP的status／scene讀取，沒有execute_blender_code、save、切換場景、刪物件、重匯出或更新外掛。Khronos函式直接讀三份GLB bytes，結果寫到audit暫存再作文件副本；原資產根前後hash比對結果在 `evidence/asset-protection.json`。

檔案證據本身沒有證明Claude新環境可讀同一路徑；若inventory裡的來源遺失，應先求助備份／人工交付，不可重跑過程腳本假裝復原。
