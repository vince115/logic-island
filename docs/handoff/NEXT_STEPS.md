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

> 2026-10-29 更新：D.0、D.1 已在分支 `phase-d/basics-glb` 完成並被接受。原 D.2 拆成 D.2a／D.2b／D.2c；D.2a（六角聚落預覽 `/islands/hex`）已驗收；D.2b 工程驗收通過（`fa3a9a9`，37 格為技術基準）；D.2c-1 視覺改善試作的視覺方向已接受（2026-10-30，`f99f858`，`logs/2026-10-29-d2c1-composition.md`）；D.2c-2 渲染效能優化驗收通過，提交為獨立 commit「static shadow map, tree LOD and deep-sea frame for the 37-tile prototype (Phase D.2c-2)」（`logs/2026-10-30-d2c2-performance.md`）。D.3 整合方案已分析（`logs/2026-10-30-d3-integration-analysis.md`），2026-10-30 批准 D.3-0～D.3-2；D.3-0～D.3-2 已完成（`logs/2026-10-30-d3-0-baseline.md`、`logs/2026-10-30-d3-1-scene-presets.md`、`logs/2026-10-30-d3-2-shared-explorer.md`）；D.3-3 Preflight 已完成並有條件驗收通過（`72e3eb6`；`logs/2026-10-30-d3-3-preflight.md`：候選頁 `/islands/candidate`、回退頁 `/islands/legacy`，正式 `/islands` 不變），正式切換未批准；D.3-4 真機驗收準備已完成（`logs/2026-10-30-d3-4-prep.md`、[DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)）：2026-10-30 起分為 D.3-4A 自動化驗收（Automated Acceptance Passed，限已執行項目）與 D.3-4B 真機效能驗收（Not Measured）；iOS Safari／Screen Reader Not Verified。B 的標準測試機為 iPhone SE（第 3 代，最低效能基準）、iPhone 16（標準效能基準）、中階 Android（Chrome），依驗收表執行；取得前標 Not Measured，**不阻擋其他開發階段**，但 D.3-4 整體未判定、正式切換仍需另行批准。D.3-5／D.3-6 規劃 2026-10-30 批准（`logs/2026-10-30-d3-5-d3-6-analysis.md`），**D.3-5a 自由相機（Lab Only）已完成並驗收接受**（`f719f42`，`logs/2026-10-30-d3-5a-free-camera.md`），**D.3-5b Auto Orbit（Lab Only）已完成並驗收接受**（`57364a2`，`logs/2026-10-30-d3-5b-auto-orbit.md`），**D.3-6a 環境架構重構已完成**（只有中午、畫面不變；效能 Inconclusive（輕微），首幀待候選頁整合時以配對方式重量，KNOWN_ISSUES P1-30；`logs/2026-10-31-d3-6a-environment.md`），**D.3-6b 四種時間情境已完成**（只在實驗室頁，中午畫面不變；`logs/2026-10-31-d3-6b-time-of-day.md`），**D.3-6c 傍晚暖光與 Lab 收尾已完成**（`logs/2026-10-31-d3-6c-dusk-glow.md`），**D.3-5c／D.3-6d 候選頁整合已完成**（`logs/2026-10-31-d3-5c-d3-6d-candidate.md`），**D.3-7a 候選頁手機 UI 修飾已完成**（`logs/2026-10-31-d3-7a-candidate-mobile-ui.md`），**D.3-4B：Preparation Complete — Real Device Not Measured**（`logs/2026-10-31-d3-4b-device-prep.md`；使用者依 [DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md) 在 iPhone SE 第 3 代、iPhone 16、中階 Android 實測並提供匯出報告後，再決定是否修正候選頁與是否授權正式 `/islands` 切換），下一步是 D.3-4B 真機驗收（以整合後的候選頁為對象），之後再決定是否推進正式 `/islands`，都需另行批准；D.3-4B 改在候選頁功能整合後、正式切換前執行。其他島嶼遷移、D.2c 後續與 D.3（效能、真機、最終驗收）都需另外批准。以下為原始規劃要點。

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

> 2026-11-01：**首頁改為全畫面 3D 群島**（使用者決定）：首頁 `/` 一進來就是候選頁的 `IslandsWorldExplorer`，以 `layout="fullscreen"` 去掉卡片外框、左右滿版，地圖高度填滿標頭以下的畫面（桌機 64 px、手機 88 px 標頭，由 `--header-h` 統一設定；原為 82／112 px；手機另扣工具列、地圖標題與下方控制列）；3D 場景延遲載入，WebGL 失敗時沿用既有回退。「3D 群島／清單」切換移到網站標頭（`header-tools` 插槽，以 portal 放入；手機只顯示圖示），首頁不再有地圖自己的工具列，地圖高度改為標頭以下的整個畫面；「3 座主題島嶼／教材入口」統計只留在內頁 `/islands/candidate`。首頁只剩地圖與 Footer（保留一個視覺隱藏的 h1）；原本的標題、介紹、三個特色與 Think·Visualize·Code 移到「學習路線」`/learn` 的上方（`src/components/learn-intro.tsx`），首頁的 6 張教材卡片移除（`/learn` 本來就列出同樣的 6 份）。之後：標頭的「清單」按鈕只開關島嶼清單（地圖一直在）；原本的明暗按鈕改為四個時辰（清晨日出、中午太陽、黃昏日落、傍晚月亮；只有傍晚是深色），首頁場景跟著切換、地圖下方的時間選單移除（`src/lib/site-time.ts`）；Navbar 改為半透明（模糊），在首頁寬螢幕上浮在全畫面地圖上方，其他頁面與手機仍在頁面流中（不 sticky：sticky 會在手機上蓋住候選頁地圖的拖曳區）。首頁點選島嶼會顯示它的科目：`src/content/curriculum/units.ts` 把每島 20 堂分成 5～6 個科目（測試確認每堂只屬於一個科目），科目以浮動面板疊在地圖上（參考 puma.taipei/heart-island 的左下角清單；寬螢幕在左下角，手機在地圖下緣，可按 × 關閉、再點島嶼重新打開），列出島嶼進度、可展開的科目與各堂課連結（含已完成／進行中），再列出相關互動實驗與完整課綱連結；右側島嶼清單只放島嶼與簡介，不放科目。手機從下方清單選島時，頁面會捲回地圖。點選島嶼只打開浮動面板：右側島嶼清單只由標頭「清單」按鈕開關，收起時點島嶼不會讓它重新出現。全站字體改為九級標準（`--text-xs` 12px 到 `--text-4xl` 44px，12px 為下限），見 [字體大小標準](../design/TYPOGRAPHY.md)；新樣式請只用這些 token。地圖修正（使用者回報）：資料結構島與演算法島之間的石橋兩端高度不同（0.55／1.25），原本橋面以平均高度水平放置，一端埋進石台、一端懸空；改為由一端斜到另一端（`bridgeParts`，水平的橋不變，`tests/world-data.test.ts` 的 37 格與 19 格世界指紋因此更新）。資料結構島、演算法島與視覺化實驗島的地標原本立在道路交會的中心格上，擋住道路；改放在中心旁不經道路的格子（倉庫在北側、天文台在東北高台、實驗穹頂在北側），中心格成為道路交會的廣場（`hex-landmarks.tsx`）。

> 2026-11-02：**Phase E.5 第一項：Navigation & Learning Entry Consolidation**（使用者授權，只處理路由、導覽與入口）。Header 改為「探索群島（`/`）／完整課綱（`/curriculum`）／互動實驗室（`/learn`）」，「開始學習」開啟 F01（`/curriculum/programs-and-algorithms`，slug 由 `lessons.ts` 取得）。`/visualize`、`/visualize/[slug]` 原本與 `/learn` 列出相同六個 Lab、詳細頁是同一個 `Lesson` 元件（只差麵包屑與一個沒有實際差異的模式切換連結），改為在 `next.config.ts` 永久轉址（308）到 `/learn`、`/learn/[slug]`，保留 slug 與查詢參數，並移除原頁面與模式切換。`/learn` 定位為「互動實驗室」；原本在 `/learn` 上方的介紹改為 `/curriculum` 開頭的簡短「Think · Visualize · Code」說明與兩個入口（從 F01 開始、互動實驗室），不再有 Hero。視覺化實驗島面板、404 頁同步更新。60 堂課綱頁、六個 Lab、Quiz／Progress／Visualization 未改。新增 `e2e/navigation.spec.ts`（轉址、主選單、F01、66 個詳細頁、站內連結無失效）。未處理：GLB Workshop 仍指向 `/learn`（KNOWN_ISSUES P1-34）。E.5 其他工作未開始。首頁地圖新增第四座島「視覺化實驗島」（THE VISUAL LAB，使用者決定）：`/visualize` 的 6 個互動實驗以島嶼呈現，位於基礎程式島南方，以石橋連接演算法島西南角（跨兩格水面，`islandsHomeWorld`，`src/lib/islands/islands-world.ts`）；地標為程序產生的實驗穹頂、排序長條、堆疊方塊與圖節點（`hex-landmarks.tsx`，不使用 GLB）；點選後浮動面板依類別（資料結構、搜尋與排序、圖論）列出實驗並連到 `/learn/<slug>`。它不是科目島：不加入課綱的 `IslandId`，`islands`（正式 `/islands` 與 `/islands/candidate` 使用）仍是三座、世界資料指紋不變；`tests/home-world.test.ts` 檢查首頁世界有效、原三島與橋不變、新島與其他島至少隔兩格水面。全景相機依內容自動框住四座島，未改相機程式。手機聚焦時浮動面板會蓋住島的下半部（所有島相同）。正式 `/islands` 與候選頁不傳科目資料，維持原樣。`/islands/legacy` 手機版的工坊點擊測試偶爾失敗（重跑通過，與這些改動無關，負載較高時出現）。手機標頭仍是兩列（第二列是主選單連結）。正式 `/islands` 與 `/islands/candidate` 不變。注意：D.3-4B 真機效能仍 Not Measured，首頁首次載入現在會下載 3D 資源，真機驗收應把首頁也列入。

> 2026-11-02：**功能區定名「互動實驗島」（Interactive Lab Island，`/learn`）**（使用者決定）：取代先前的「互動實驗室」與首頁地圖的「視覺化實驗島」。主選單為探索群島（Explore Islands，`/`）／完整課綱（Curriculum，`/curriculum`）／互動實驗島（`/learn`）；`/visualize` 仍永久轉址到 `/learn`。改名範圍：主選單、`/learn` 標題與 metadata、實驗頁麵包屑、首頁地圖的島名與英文名（`labIsland`）、地圖面板與課綱簡介的入口、404 文案；課綱頁標題與麵包屑統一為「完整課綱」。每個實驗頁內的面板標題由「互動實驗室」改為「互動實驗」（面板不是功能區名稱）。「演算法視覺化」仍作為功能描述。未改：資料結構島介紹中的「進入真正的互動實驗室」（泛指實驗，且顯示於正式 `/islands`）、ROADMAP 中的未來範圍描述、本檔較早的日期紀錄。探索群島仍指向首頁 `/`：`/islands` 是 Prototype 02A 的舊地圖頁，依保護範圍不改。網站沒有多語系機制，英文名稱以頁面眉標與 metadata 呈現。

> 2026-11-02：**程式語言順序與 JavaScript**（使用者決定）：語言分頁與清單的順序改為 C++、Java、Python（`schema.ts` 的 `LANGUAGES`、課綱 `code.tsx`、實驗 `lab.tsx`，以及介面文案）；60 堂課綱正文內的三語比較表與文字仍是原本的 C++、Python、Java 欄序，未改教材。互動實驗島的六個實驗在 Python 之後新增 JavaScript（`courses.ts` 的 `LabLanguage`／`LAB_LANGUAGES`，Node.js 執行；佇列與 BFS 以 head 指標避免 `shift()` 的 O(n)），`tests/examples.test.ts` 以 Node 執行並比對輸出，另檢查四種語言的每個動畫步驟都有標記行。60 堂課綱仍是三種語言；是否為課綱加入 JavaScript（約 206 個範例與 60 份參考解答）需另行決定。

> 2026-11-02：**課綱 JavaScript 試點：F05 條件判斷**（使用者授權，只做一堂）。課程語言改為每堂課自訂：`schema.ts` 新增 `LessonLanguage`／`OPTIONAL_LANGUAGES`／`LessonCode`，每堂必含 C++、Java、Python，可在 `lessons.ts` 以 `extraLanguages: ['JavaScript']` 加入 JavaScript；驗證規則要求有列 JavaScript 的課程每個範例與解答都有 JavaScript、沒列的課程不得有 JavaScript 程式碼。`code.tsx` 的分頁只顯示該課的語言（由 `LessonLanguages` context 提供），記住的語言在不支援的課程顯示 C++、不覆寫記憶。`tests/curriculum-code.test.ts` 依每堂課的語言執行，JavaScript 用 Node.js。F05 的 3 個範例與練習解答（18 組測資＋2 組範例）都有 JavaScript；正文 4 處語法說明補上 JavaScript，新增「JavaScript 的範例怎麼執行」說明；練習區在支援 JavaScript 的課程顯示 `node main.js < input.txt`；F05 版本 1.0.0 → 1.1.0。其餘 59 堂未改。之後依使用者要求，F01 程式與演算法入門也加入 JavaScript（3 個範例、starter 與解答；JavaScript 的 `/` 會保留小數，所以用 `Math.floor` 取整數，正文與提示已說明；正文 6 處語言說明補上 JavaScript；版本 1.1.0）。目前有 JavaScript 的課程：F01、F05，課綱目錄開頭的說明列出它們（依使用者要求，清單列不另加「+ JavaScript」標籤）。

> 2026-11-02：**全部 60 堂課綱加入 JavaScript**（使用者要求）。依 E.3／E.4 的做法：13 個背景撰寫者，每人負責 3～5 個 `content/*.ts`（單一寫入者），在各自的檢查副本以 `-t "<ID> code"` 執行四種語言、驗證規則與 tsc；主線再於隔離副本統一開啟 `extraLanguages`、全部重跑、檢查文字格式。共新增約 260 個 JavaScript 程式（範例、參考解答、starter），全部以 Node.js 執行並與既有預期輸出一致。重點寫法：讀入 `require("fs").readFileSync(0, "utf8")`；整數除法用 `Math.trunc`／`Math.floor`；超過 2^53 用 BigInt（例如 F08、F18、D05、A04、A11、A17、A19 的部分程式）；佇列用 head 索引而非 `shift()`；堆積、雙端佇列自行實作（D07、D15、D19、D20、A16）；排序一律給比較函式。`outputByLanguage` 只新增一處：D09 的 `Map.get` 缺 key 回傳 `undefined`（不丟例外），照實輸出並在正文說明。正文中逐語言說明語法或行為的句子、每語言一欄的表格都補上 JavaScript，「三種語言」改為「各語言／四種語言」；測驗題目未改（部分解析仍只比較三種語言）。課綱目錄說明改為「C++、Java、Python、JavaScript 四語對照」。視覺化 trace 仍是單一語言。

> 2026-11-02：**首頁兩個面板改為類似 Navbar 的半透明背景**（使用者決定）：左下科目面板與右側島嶼清單都用 `color-mix(var(--panel) 72%)` 加 `blur(12px) saturate(1.4)`，內部卡片也半透明。寬螢幕上右側清單改為浮在地圖右緣（地圖全寬，如同 Navbar 浮在上緣），底部按鈕留在清單左側；手機清單仍在地圖下方。為了讓島嶼與名牌不被清單遮住，經使用者同意在相機加入可選的右側內距：`HexCamera` 的 `frame()` 多一個 `insetRight`（預設 0，其餘頁面與正式 `/islands`、候選頁不變），首頁在清單開啟時傳入清單寬度（340 px；781～1050 px 為 300 px），全景與聚焦都框在清單左側。

> 2026-11-02：**程式碼語法高亮**（使用者要求）。新增依賴 `shiki@4.5.0`（精確版本，只在隔離副本安裝；工作目錄只改 `package.json`／`pnpm-lock.yaml`，本機開發前需 `pnpm install`）。Shiki 用 VS Code 同款 TextMate 文法，只在伺服器元件、建置時執行（`src/lib/highlight/server.ts`，頂層 await 建立 highlighter）；用一組「佔位色」主題把文法 scope 對應到 12 種 token 類別，輸出每行的 `[文字, 類別]`（`src/lib/highlight/kinds.ts`），由共用的 `Highlighted` 元件（`src/components/highlighted.tsx`）渲染成 `tk-*` span；顏色只在 `globals.css` 的 `--hl-*` 變數（深藍底的柔和 Dark+／One Dark 風格，程式碼面板在深淺主題都是深色）。套用範圍：互動實驗島六個 Lab 的程式碼面板（`lab.tsx`，保留動畫步驟對應行的背景、行號、四語分頁）、課綱範例／起始程式碼／參考解答（`CodeTabs`）、逐步執行的 trace（`Trace`，保留目前行標示）、測驗程式片段（`Snippet`）。Shiki 不進入瀏覽器 bundle；最大的課綱頁（A16）gzip 約 75 KB。若某行的片段拼不回原文就顯示純文字，`tests/highlight.test.ts` 檢查所有 Lab 與 60 堂課的每一行都一字不差。

> 2026-11-02：**E.5 工作目錄整併**（使用者授權）：上述命名、語言、半透明面板與語法高亮原本都未提交，整併為 4 個本地 commit（`a6bacfe`、`3632a75`、`b525608`、`b52b8e9`）加一個文件 commit，每個 commit 都先在隔離目錄驗證；最終整合驗證 Vitest 1343 passed、E2E 只有既有 P1-11 的 3 項失敗。詳見 `logs/2026-11-02-e5-consolidation.md`。未 Merge、未 Push；Phase F.0 未開始，需另行批准。

> 2026-11-02：**Phase F.0 Multi-Island Architecture Foundation**（使用者授權）：新增 `src/content/world/`（區域與島嶼 registry、完整前綴 Lesson ID 解析、320 堂 catalog、6 條學習路線、活動 metadata、島嶼設定驗證與讀取 helper），四個本地 commit；規劃資料由 `node scripts/planning-data.mjs` 從 `docs/planning/data` 產生，改了規劃 JSON 後要重跑（測試會在不同步時失敗）。60 堂、四語、進度、路由、3D 首頁與受保護路徑都沒有改。沒有頁面讀取新 registry；之後若要顯示規劃中的島或路線，只能標 Planned、不可連到不存在的頁面（`href` 只有完整課程才有）。待決：區域中文名稱與 12 座規劃島的主題色為暫定；`assembleLayout` 多聚落（M1）未做；F.1 未開始、需另行批准。詳見 `logs/2026-11-02-f0-architecture-foundation.md`。

> 2026-11-02：**Phase F.1a 資料庫應用島 MVP**（使用者授權）：DB01–DB05 五堂 SQL 完整教材（標題、目標、先修讀自藍圖）與瀏覽器內的 SQL Playground（新增依賴 `sql.js@1.14.2`；工作目錄已 `pnpm install --frozen-lockfile`）。SQL 課程沒有四語分頁；練習以結果比對、另用隱藏資料檢查。藍圖的 `status` 不改，發布與否由課綱決定，世界 registry 推導資料庫應用島為 available（5／20）。`/curriculum` 顯示四座島，DB06–DB20 標「規劃中」且不可點；A20 的下一堂接 DB01。3D 首頁、Lab、四語課程與進度格式不變。之後：DB06 起每批 2–3 堂，沿用同一套撰寫與驗證流程；DB07 需要比對資料表內容的判定方式；加上 CSP 時要允許 `wasm-unsafe-eval`。詳見 `logs/2026-11-02-f1a-database-mvp.md`。

> 2026-11-02：**Phase F.1b 資料庫應用島擴充**（使用者授權）：DB06–DB10 五堂完整教材（藍圖的標題、目標、先修與活動），資料庫應用島開放 10／20 堂，全站 70／320 堂完整。SQL 練習新增「檢查敘述」判定（建表、修改資料）；新活動 ER 建構（DB08、DB09 的 ER 圖）與正規化工作台（DB10），只在用到的課載入。每堂課明確宣告 `capabilities`（`program-code`、`sql`、`er-diagram`、`normalization`），頁面與測試依能力選擇，不再由缺少的欄位推測。上一堂／下一堂只在同一座島內：A20 不再接 DB01，島的最後一堂改列學習路線的下一步與橋；DB10 的下一堂 DB11 只顯示為規劃中。3D 首頁、Lab、60 堂四語課程與進度格式不變。之後：DB11 起每批 2–3 堂（DB11 索引的 query-plan 活動需要新的能力宣告）；程式碼測試的 stdin 繼承問題（KNOWN_ISSUES P2）可另案修正。詳見 `logs/2026-11-02-f1b-database-expansion.md`。

> 2026-11-02：**Phase F.1c 資料庫應用島擴充**（使用者授權）：DB11–DB15 五堂完整教材，資料庫應用島開放 15／20 堂，全站 75／320 堂完整。新增兩個瀏覽器內的活動：query-plan（查詢計畫寫成步驟、練習依「計畫要求」判定、B+ 樹探索、`sales` 大型資料集）與 transaction-timeline（WAL 時間軸與當機復原、鎖／MVCC 的交錯排程與異常偵測），只在用到的課載入。程式碼測試卡住的根因已找到並修正（測資改以檔案作為 stdin、每次執行有逾時並終止子行程；F.1b 記錄的「繼承 stdin」是錯的，已更正），完整 Vitest 不再需要 `< /dev/null`。藍圖的跨島建議先修（PL13、PL14）以「規劃中」顯示。3D 首頁、Lab、60 堂四語課程、DB01–DB10 與進度格式不變。之後：DB16 起每批 2–3 堂，先對照藍圖活動決定重用或新增能力。詳見 `logs/2026-11-02-f1c-database-expansion.md`。

> 2026-11-02：**Phase F.1d 資料庫應用島完成**（使用者授權）：DB16–DB20 五堂完整教材，資料庫應用島 20／20 完整，全站 80／320 堂完整。新增參數綁定與參數組練習（含惡意輸入）、當機一致性檢查（DB14 的轉帳練習現在能分出有沒有交易邊界）、往返序列（N+1／JOIN／批次 IN）、架構圖與備份／複寫模擬、驅動程式範例（Python／JavaScript 實際執行、Java 編譯），以及 `auth`、`documents` 資料集；DB20 是本島最後一堂，不接到其他島。整合時修正：查詢時間限制改從查詢開始計算、參數組練習也檢查查詢計畫、完成的課保留藍圖缺口。3D 首頁、`/islands`、Lab、60 堂四語課程、DB01–DB13／DB15 內容與進度格式不變。依指示停止，下一座島需另行授權。詳見 `logs/2026-11-02-f1d-database-island-completion.md`。

> 2026-11-02：**資料庫應用島 3D 世界整合**（**Phase F.1e**，原稱 F.2；PHASE_F_ROADMAP 的 F.2 仍是 AI 教材階段）：首頁地圖成為 5 座島，資料庫應用島在六角 (2, -9)、以木橋接資料結構島，使用過渡地標；選島後可進入 DB01–DB20，教材開放數與個人進度分開顯示。`/islands` 等原型頁不變。之後：正式 GLB（Blender 管線，需授權）、M3 區域地圖時重新規劃位置。詳見 `logs/2026-11-02-f2-database-island-world.md`。

> 2026-11-03：**M3.0 CS＋AI 群島世界規劃**（只有文件）：推薦 Regional World（總覽 → 區域 → 島嶼），保留既有 4 座學科島的座標與橋；下一步待使用者批准 [M3_CS_AI_MASTER_PLAN](../planning/M3_CS_AI_MASTER_PLAN.md) §10 的 12 項決策後，才開始 M3.1（區域架構）或 M3.2（代表島 GLB）。

> 2026-11-03：使用者有條件批准 M3.0（資料庫島 3D 整合歸檔為 **F.1e**；F.2 仍是 AI 教材階段；`/` 不切換，新世界走 feature flag；先完成 M3.1 驗證再建模；預算是暫定目標；Blender MCP 先查相容性）。**M3.1 架構提案**已完成（[M3_1_REGIONAL_WORLD_ARCHITECTURE](../planning/M3_1_REGIONAL_WORLD_ARCHITECTURE.md)），待使用者確認後才實作 prototype；M3.2 正式建模的進入條件見該文件 §8。

> 2026-11-03：**M3.1 Regional World Prototype** 已在 flag 後實作與驗收。
> - 手機島寬未達 88 px，列為上線前的限制。
> - M3.2 的 10 項進入條件：Pass 5（區域座標與橋已由使用者批准為定案）、Fail 1（手機鏡頭）、Pending 4（契約與 LLM 佔地格、正式預算與真機、Blender MCP 相容性、Pipeline 範本）。
> - **M3.2 尚未開始**，等待使用者批准。
> - 見 `logs/2026-11-03-m3-1-regional-world-prototype.md`。

## 6. Phase E：Data-Driven Islands（Planned，D 驗收後）

> 2026-10-31：**E.1（60 堂課綱架構與學習引擎）已完成**（`logs/2026-10-31-e1-curriculum.md`）；**E.2 基礎程式島 20／20 完整**（`logs/2026-10-31-e2-foundations.md`），Java 已補驗。**E.3 資料結構島 20／20 完整**（`logs/2026-10-31-e3-structures.md`），完整教材 40／60。**E.4 演算法島 20／20，課綱 60／60 完整**（`logs/2026-10-31-e4-algorithms.md`）。E.5 候選（需另行批准，未開始）：較大圖的排版（KNOWN_ISSUES P1-33）、課綱入口（網站選單、島嶼名牌連到課程）、在 CI 安裝 JDK 17 讓 Java 測試不被略過、課程內容的人工教學審閱；決定課綱入口（網站選單、島嶼名牌連到課程）。D.3-4B 真機驗收與正式 `/islands` 切換仍獨立待決。

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
