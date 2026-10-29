# Claude Code 接手入口

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 先記住五件事

1. 根目錄 `/Users/vincelo/dev-hub/github/vince115/logic-island`（原 `logic-lab`，專案已由 LogicLab 更名為 Logic Island）**沒有 .git**；不要假造branch／HEAD／remote，不自動init。
2. 六教材及引擎存在、unit／DOM／Python／C++測試通過，但當前lint／TS／build失敗；不是可立即交付的乾淨基線。
3. `/islands` 已有R3F三島**原創幾何原型**；正式Blender GLB載入與子節點路由尚未做。
4. v2.1模型與報告已實際存在，但本次用戶說C.1未批准；先釐清批准，不重做或覆蓋。Phase D明確未批准。
5. GLB／BLEND／PNG／美術文件在Codex私有絕對路徑，不在repo；換機必須先按inventory核對與經批准複製。

## 建議閱讀順序

1. 根 `CLAUDE.md`、`AGENTS.md`：長期工作規則與此版本Next本機文件要求。
2. [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md)：定位、版本、路由、env、指令。
3. [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md)：Phase與人工批准分帳、Git狀態。
4. [KNOWN_ISSUES](KNOWN_ISSUES.md)：P0／P1／P2。
5. [TESTING_STATUS](TESTING_STATUS.md) 與 `evidence/actual-*.log`：目前失敗的可重現結果。
6. [ARCHITECTURE](ARCHITECTURE.md)：六教材、播放器、3D原型依賴與耦合。
7. [BLENDER_ASSET_INVENTORY](BLENDER_ASSET_INVENTORY.md)：完整資產路徑／bytes／用途／例外。
8. [NEXT_STEPS](NEXT_STEPS.md)：批准關卡與最小修復順序。

## 核心檔案地圖

- `src/content/courses.ts`：六教材與三語固定範例，不能重建成另一套資料。
- `src/lib/engine.ts`：純Step快照、六演算法、解析與游標。
- `src/components/lab.tsx`：共用播放器；Lesson以course.slug為key重掛。
- `src/app/learn/[slug]/page.tsx`／`visualize/[slug]/page.tsx`：async params，dynamicParams=false。
- `src/lib/islands/`：原型資料、types、original-geometry registry。
- `src/components/islands/`：R3F原型／navigation／camera；缺少islands.module.css。
- `tests/`、`e2e/`：45pass／6skip；E2E22個案例僅列出。
- `package.json`／`pnpm-lock.yaml`／`pnpm-workspace.yaml`：固定依賴；不要因交接隨意更新。
- 外部資產根：`/Users/vincelo/.codex/visualizations/2026/10/28/01a181a6-111f-7253-aa8f-a6448848c162/`。
- v2候選：`basics-v2/LogicLab_Basics_Island_v2.blend`、`basics-v2/logiclab-basics-island-v2.glb`。
- v2.1待確認候選：`basics-v2.1/LogicLab_Basics_Island_v2.1.blend`、`basics-v2.1/logiclab-basics-island-v2.1.glb`。

完整每檔絕對路徑與SHA見 `evidence/asset-inventory.json`；不要只憑檔名中的v2決定目前開啟版本。MCP目前場景仍叫Basics_Island_v2，但filepath實為v2.1；已核對於 `evidence/blender-current.json`。

## 第一個建議任務

先做**只讀的狀態／批准對齊**：向用戶呈現「無Git、3個品質阻擋、v2.1已存在但批准不一致」，確認是否接受現存v2.1，以及是否授權修復最小build基線。不要自行開始新的建模或Phase D。

若得到下一個程式修復授權，第一個coding工作包應只修CSS缺檔、three型別與R3F lint問題，保留六教材輸出、現有原型與資產。驗收後再處理資產選版／搬移／正式整合。

## 接手時禁止推定或執行

- 本交接任務只允許文件，不授權修改src／套件／lockfile／測試／部署／模型。新的Agent必須等待下一個具體任務。
- 不自動git init／checkout／reset／clean／commit／push，不以沒有Git為理由刪目錄重建。
- 不覆蓋來源BLEND、刪其他場景、執行歷史C1／C2／polish／seams生成腳本。這些是過程記錄，不是安全的「續作」指令。
- 不把Khronos通過／獨立Three.js viewer測試改寫成正式R3F整合通過；不把手機視窗當真機。
- 不把檔案存在、舊對話要求或C.1候選當作Phase D／部署批准。
- 不輸出秘密值。環境檔若日後出現只盤點名稱與需要的變數名稱，不貼內容。
- 不同Agent不要同時寫同一工作樹／Blender session；先約定單一寫入者與可恢復checkpoint。

## 交接依賴限制

Codex MCP與Chrome路徑不會自動移到Claude Code。Claude需要獨立設定／檢查Blender MCP，只讀確認版本與場景；本輪addon protocol仍14／server預期15，未升級。暫存測試副本可失效，關鍵結果已複製到evidence，別要求原/tmp永久存在。
