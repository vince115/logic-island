# 接手後執行順序與驗收標準

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 0. 先讀取與對齊，不修改產品

第一個建議任務：**核對 v2.1 候選與批准狀態，重現目前 build blockers，產出最小修復方案供人工決定**。以 docs/handoff/evidence 為起點，不執行 Blender 生成腳本，不自動進入 Phase D。

需請人工確認：

- ~~本次「C.1 尚未批准執行」與已存在 v2.1 如何處理？採用現有候選、補人工驗收，或只保留備查？~~ **已決議（2026-10-29）**：C.1 有條件批准，v2.1 為 Phase D 候選資產（技術驗收通過、視覺有條件接受），不需立即製作 v2.2；Phase D 仍待批准開始。原始問句保留為決策紀錄，決議全文見 [ROADMAP](ROADMAP.md)。
- 同意先修復當前原型的缺失 CSS／three 型別／lint 嗎？這是恢復既有專案基線，與正式 GLB 整合分開授權。
- 真正的 Git remote／歷史在哪裡，是否要另行授權初始化或重新取得？本輪無 Git，不可自行猜 URL。

以上問句是**未來決策清單**，不是本輪已得到的批准。

## 1. 恢復可信基線（需新的程式修改授權）

1. 在隔離副本重現 `TESTING_STATUS.md` 失敗。確認缺少 islands.module.css 是遺漏的內容，不虛造原始設計。
2. 僅修缺檔、正確型別與 R3F background ownership；不改教材／引擎輸出、不移除 lint 規則、不大幅改畫面。
3. lint／tsc／unit／clean build 全過，保留45 passed與Java skip的真實狀態。若具JDK後六Java才可改記pass。
4. build 成功後執行22個既有Browser E2E；另驗證 `/islands` loading、list fallback、keyboard、contextlost、手機 layout。不要拿 test --list 充數。
5. 將核准後的來源安全納入版本管理方案；本輪不能代為執行 init／commit／push。

## 2. Phase C.1：接受或補驗收現有候選

**不要把此標題理解成尚無 v2.1 檔，或自動重做。** 已有文件與模型，應先閱覽下列證據：

- 外部 `basics-v2.1/LogicLab_Basics_Island_v2.1_Review.md`、兩個PNG、Source_Protection.json。
- Roof_Adjustment.json：X width 0.9；模型實際屋頂另抬高0.10m修復接合。入口、橋與群組Pivot保留。
- Node_Contract_Validation.json：既有43節點父子／Transform未改，新3Mesh。
- Coplanar_Exceptions_and_Acceptance.json：raw strict false，兩視角可見同向配對0，113組剩餘接觸；不代表所有角度無Z-fighting。
- 本輪 evidence/glb-current.json 與歷史 Polish_Browser_Validation.json：格式再驗證通過，三地標的獨立viewer raycast有證據。

接受條件：人工確認屋頂／文字／中央疏密、認可例外分類，確認選用GLB的SHA，必要時做真實手機／近遠鏡頭Z-fighting檢查。若需微調，只改指定區域、另存版本，不覆蓋v2或候選。~~目前 C.1 批准尚未對齊，不再執行建模。~~（原始紀錄；C.1 已於 2026-10-29 有條件批准，見下方更新。）

> 2026-10-29 更新：使用者已正式批准 v2.1 為 Phase D 候選資產（有條件），不需立即製作 v2.2；決議全文見 [ROADMAP](ROADMAP.md)。

## 3. 資產移交（經選版與搬移批准後）

1. 先驗 inventory 中 bytes／SHA-256，再以複製方式將核准 GLB 放到產品資產路徑（例如未來 `public/models/logiclab/`，目前不存在）。
2. BLEND 源檔與PNG／規格／Validator報告分開保存；可以評估 `assets-source/`＋LFS或經核准的外部儲存，不把它們當網站 runtime 必需檔。
3. 將效能預算、interaction_id、單位軸向與路由映射文件一起納入可移交位置；私有Codex路徑只作來源，不當runtime URL。
4. 不複製node_modules／.next，不依賴macOS Chrome絕對路徑或viewer的symlink。移機後測試工具安裝需要鎖版與合法環境。

## 4. Phase D：只有明確批准後開始

- 擴充 registry 的來源型別，保留原型或回退；新增GLB載入元件，而非改教材引擎。
- 依實際選定模型包圍盒與Y up尺度更新bounds／鏡頭，不沿用原型較小的手填box導致裁切。
- 映射穩定節點／interaction_id；Raycast從可見Mesh向父群組找語意；workshop→`/learn`、lighthouse／entry的行為需產品確認。
- Desktop hover不是手機可用性的替代；鍵盤可達的等價DOM導航、focus state、標籤、reduced motion、WebGL unavailable／contextlost fallback都須保留。
- loading／錯誤／Suspense、重複掛載、快取、dispose、光照材質、emission、可用命中區域要有測試；不要直接讓GLB覆蓋整個互動canvas。
- 手機先聚焦單島，避免多島高detail全載；以效能預算控制DPR、陰影、紋理與draw calls。縮圖文字交由可存取UI補足。

## 5. Phase D 驗收門檻（目前尚未執行）

1. lint／strict TypeScript／unit／clean build／Browser E2E全部有當期結果；教材結果與路由不回歸。
2. 選定模型在正式R3F頁能載入、hover／click／鍵盤等價導覽、三個地標最近可見命中，路由正確；無hydration／console／卸載記憶體錯誤。
3. 模型失敗或WebGL不可用仍能到六份教材；BFS不因三島映射而消失。
4. 桌機／手機視窗與真實Android／iPhone至少各一組獨立記錄；區分模擬／真機、軟體／硬體。
5. 單島預算（Style Guide）：主pass手機≤25／桌機≤35、材質≤10、GLB約≤1.5MiB（不含外部共用圖）；多島總場景另profile，不能拿單島24calls保證整體。
6. Z-fighting在核准鏡頭／距離／裝置檢查，例外有位置與理由；Validator通過不等於所有畫面正確。
7. 部署是另一道授權；D批准不自動包含commit／push／上線。

## 6. Phase E：Data-Driven Islands（Planned，D 驗收後）

以型別化 schema 定義每座島（island_id、名稱／描述／主題、GLB 資產引用、課程對應、互動節點與入口、解鎖條件、島嶼關聯），讓未來八座島共用同一套渲染與互動架構。必須相容既有 GLB `interaction_id`、Anchor 與 Node Contract；解鎖條件只宣告、不判定。詳見 [ROADMAP](ROADMAP.md)。

## 7. Phase F：RPG Learning System（Planned，依賴 E）

NPC 與任務對話、答題 EXP、玩家等級與學習進度、島嶼徽章與成就、課程任務與解鎖。進度資料放獨立領域層與儲存 adapter，3D 層只接收唯讀衍生結果。題庫來源與無登入進度保存需先由產品決定。

## 8. Phase G：APCS Challenges（Planned，依賴 F）

APCS 試煉島、中央島綜合挑戰、跨島學習任務、題目完成紀錄、成就與進階內容解鎖。新島以 Phase E schema 加入，紀錄沿用 Phase F 進度層；判題以 adapter 隔離並預留程式碼自動判題擴充，首版方式（網站目前不執行程式碼、無 OJ）需另案決定。

## 9. Phase H：AI 群島課程規劃與 Schema 擴充（Proposed／Planned，依賴 E）

AI Archipelago 六座島 AI-01～AI-06 的課程目標、先修知識、互動實驗、任務與完成條件；知識依賴圖；在 Phase E schema 加入 `archipelago: 'ai'` 等欄位。AI 課程以 Python 為主，既有 C++／Python／Java 教學不變；不以完成全部 Coding 島為前提。已決議：Python 基礎教材歸 Coding Archipelago、AI 課程只引用必要單元；AI 島程式 id 用小寫 kebab-case（AI-01～AI-06 僅顯示編號）；AI 教材採獨立內容模組並共用既有課程型別、播放器與進度介面。

## 10. Phase I：互動式 AI 實驗室與運算服務規劃（Proposed／Planned，依賴 H）

瀏覽器優先：預先計算快照 → 瀏覽器端計算 → 進階模型運算另評估後端。新增套件、後端、外部 LLM API、相機／感測器權限都需另案批准。

## 11. Phase J：AI 專題挑戰與成果展示（Proposed／Planned，依賴 I、F，重用 G 判題格式）

AI 專題挑戰、跨島任務、學習成果與作品展示；沿用 F 進度層與 G 題目格式／判題 adapter。公開分享需另案批准。

詳見 [ROADMAP](ROADMAP.md)。**E–J 都只是規劃，不得在 Phase D 中提前實作任何部分。**
