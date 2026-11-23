# 課程盤點（Phase 0，2026-11-20）

> 以 `origin/main` `36a8343` 的 Repository 實際資料重新核對（`src/content/world` 的目錄、`src/content/curriculum` 的課綱與內容），不沿用舊報告的數字。分支 `courses/batch-1`，worktree `../logic-island-courses`。

> **第一批之後（2026-11-20）**：PL01–PL05 發布，已發布 **85**、規劃中 **435**（CS 85／160；PL 5/20，程式語言島從「規劃中」變成「部分開放」）。
> **第二批之後（2026-11-20）**：PL06–PL10 發布，已發布 **90**、規劃中 **430**（CS 90／160；PL 10/20，地景仍為規劃中）。
> **CICD-1 之後（2026-11-23）**：DevOps 與 CI/CD 島開放 CICD01（devops-explorer 能力，D1 部署紀錄與 DORA 指標；`deployment-simulator` 活動改為已實作）；已發布 **230**、規劃中 **290**。
>
> **DKR-6 之後（2026-11-23）**：Docker 容器島綜合專題 DKR15 發布，全島 15／15 完成；已發布 **229**、規劃中 **291**。
>
> **DKR-5 之後（2026-11-23）**：Docker 容器島 DKR12–DKR14 發布（引擎階段 E24 runtime：容器安全、除錯、健康檢查、資源限制與優雅關閉）；已發布 **228**、規劃中 **292**。
>
> **DKR-4 之後（2026-11-23）**：Docker 容器島 DKR09–DKR11 發布（引擎階段 E23 compose：Docker Compose、多階段建置與 Registry）；已發布 **225**、規劃中 **295**。
>
> **DKR-3 之後（2026-11-23）**：Docker 容器島 DKR07–DKR08 發布（引擎階段 E22 storage-net：Volume、bind mount 與容器網路）；已發布 **222**、規劃中 **298**（含同日 MOB-3 的 5 堂）。
>
> **MOB-3 之後（2026-11-23）**：MOB09–MOB12 與綜合專題 MOB13 發布，行動應用島 13/13 完成（`mapState` 維持 planned）；已發布 **220**、規劃中 **300**。
>
> **DKR-2 之後（2026-11-23）**：Docker 容器島 DKR05–DKR06 發布（引擎階段 E21 images：Dockerfile 建置、分層與建置快取）；已發布 **215**、規劃中 **305**。
>
> **MOB-2 之後（2026-11-23）**：行動應用島 MOB05–MOB08 發布（行動表單與虛擬鍵盤、安全區域與方向、原生／跨平台／PWA 的選擇、Manifest 與安裝）；已發布 **213**、規劃中 **307**。
>
> **DKR-1 之後（2026-11-23）**：Docker 容器島開放 DKR01–DKR04（terminal 能力，引擎階段 E20 containers）；已發布 **209**、規劃中 **311**（含同日 RWD-1 至 RWD-3、MOB-1 的 16 堂）。
>
> **MOB-1 之後（2026-11-23）**：行動應用島開放 MOB01–MOB04（行動情境與限制、行動 UI 模式、觸控目標與手勢、Pointer Events；`web-code` 能力新增指標步驟與觸控目標的至少／至多檢查）；已發布 **205**、規劃中 **315**。
>
> **RWD-3 之後（2026-11-23）**：RWD09–RWD11 與綜合專題 RWD12 發布，響應式設計島 12/12 完成（`mapState` 維持 planned）；已發布 **201**、規劃中 **319**。
>
> **RWD-2 之後（2026-11-23）**：響應式設計島 RWD05–RWD08 發布（CSS Grid 基礎與進階、Media Query 與斷點策略、Container Query）；已發布 **197**、規劃中 **323**。
>
> **RWD-1 之後（2026-11-23）**：響應式設計島開放 RWD01–RWD04（響應式原則與行動優先、viewport 與相對單位、Flexbox 基礎與進階；`web-code` 能力新增預覽寬度與 `resize` 步驟）；已發布 **193**、規劃中 **327**（含同日 GEN-1 的 2 堂）。
>
> **GEN-1 之後（2026-11-23）**：生成式 AI 島開放 GEN01–GEN02（llm-explorer，GEN02 另有 python-code）；已發布 **189**、規劃中 **331**（含同日 WEB-3 至 WEB-5）。
>
> **WEB-5 之後（2026-11-23）**：WEB14 與綜合專題 WEB15 發布，網頁基礎島 15/15 完成（`mapState` 維持 planned）；已發布 **187**、規劃中 **333**。
>
> **WEB-4 之後（2026-11-23）**：網頁基礎島 WEB11–WEB13 發布（fetch、JSON 與 API；瀏覽器儲存；語意 HTML 與 ARIA）；已發布 **185**、規劃中 **335**。
>
> **WEB-3 之後（2026-11-23）**：網頁基礎島 WEB08–WEB10 發布（JavaScript 與 DOM、事件與事件委派、非同步 JavaScript）；已發布 **182**、規劃中 **338**。
>
> **LLM-1 之後（2026-11-23）**：大型語言模型島開放 LLM01–LLM03（課程能力 LLM-0 的 llm-explorer：斷詞、取樣與 embedding 探索器，示意資料）；已發布 **179**、規劃中 **341**（含同日 WEB-1、WEB-2 的 7 堂）。
>
> **WEB-2 之後（2026-11-23）**：網頁基礎島 WEB05–WEB07 發布（CSS 選擇器與串接、盒模型、定位與堆疊）；已發布 **176**、規劃中 **344**。
>
> **WEB-1 之後（2026-11-23）**：網頁基礎島 WEB01–WEB04 發布（`web-code` 能力，WEB-0），網頁與應用開發群島第一次有已開放的課；已發布 **173**、規劃中 **347**。
>
> **SRV-5 之後（2026-11-22）**：SRV14 綜合專題發布，網路與伺服器島 14/14 完成（`mapState` 維持 planned）；已發布 **169**、規劃中 **351**。
>
> **SRV-4 之後（2026-11-22）**：網路與伺服器島 SRV11–SRV13 發布（引擎階段 E18 HTTP 快取與 CDN、E19 網路診斷工具）；已發布 **168**、規劃中 **352**。
>
> **SRV-3 之後（2026-11-22）**：網路與伺服器島 SRV07–SRV10 發布（引擎階段 E15 反向代理與負載平衡、E16 主機防火牆、E17 SSH 通道）；已發布 **165**、規劃中 **355**。
>
> **SRV-2 之後（2026-11-22）**：網路與伺服器島 SRV04–SRV06 發布（引擎階段 E13 TLS 憑證、E14 nginx）；已發布 **161**、規劃中 **359**。
>
> **SRV-1 之後（2026-11-22）**：網路與伺服器島 SRV01–SRV03 發布（terminal 能力＋network-protocol 情境；引擎階段 E10 sockets、E11 DNS、E12 HTTP）；已發布 **158**、規劃中 **362**。
>
> **LNX-5 之後（2026-11-22）**：LNX15 綜合專題發布，Linux 系統島 15/15 完成（`mapState` 維持 planned）；已發布 **155**、規劃中 **365**。
>
> **LNX-4 之後（2026-11-22）**：Linux 系統島 LNX12–LNX14 發布（引擎階段 E7 SSH、E8 Bash 指令稿直譯器、E9 cron 與 systemd timer）；已發布 **154**、規劃中 **366**。
>
> **LNX-3 之後（2026-11-22）**：Linux 系統島 LNX08–LNX11 發布（引擎階段 E4 行程與訊號、E5 apt 套件、E6 systemd 與 journal）；已發布 **151**、規劃中 **369**。
>
> **LNX-2 之後（2026-11-22）**：Linux 系統島 LNX05–LNX07 發布（引擎階段 E2 管線與重新導向、E3 使用者與群組）；已發布 **147**、規劃中 **373**。
>
> **LNX-1 之後（2026-11-22）**：Linux 系統島 LNX01–LNX04 發布（`terminal` 能力，LNX-0；引擎階段 E1），系統與雲端工程群島第一次有已開放的課；已發布 **144**、規劃中 **376**。
>
> **AIF-5 之後（2026-11-22）**：AIF20 綜合專題發布，AI 基礎島 20/20 完成（`mapState` 維持 planned）；已發布 **140**、規劃中 **380**。
>
> **AIF-4 之後（2026-11-22）**：AI 基礎島 AIF16–AIF19 發布（馬可夫鏈與 HMM、決策理論、MDP、負責任的 AI）；已發布 **139**、規劃中 **381**。
>
> **AIF-3 之後（2026-11-22）**：AI 基礎島 AIF11–AIF15 發布（命題邏輯、一階邏輯、機率基礎、貝氏定理、貝氏網路）；已發布 **135**、規劃中 **385**。
>
> **AIF-2 之後（2026-11-22）**：AI 基礎島 AIF06–AIF10 發布（區域搜尋、minimax、alpha-beta、CSP、知識表示）；已發布 **130**、規劃中 **390**。
>
> **AIF-1 之後（2026-11-22）**：AI 基礎島 AIF01–AIF05 發布（`python-code` 能力，AIF-0），AI 群島第一次有已開放的課；已發布 **125**、規劃中 **395**。
>
> **CN-5 之後（2026-11-22）**：計算機網路島 20 堂全部發布（`network-protocol` 能力，CN-0；CN11、CN14、CN16、CN20 為四語程式課），學習路線 C（網路與系統）可完整學完；已發布 **120**、規劃中 **400**（CS 120／160；程式語言島與計算機網路島的地景仍為規劃中）。之後的數字以 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 與 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md) 為準。尚未實作的互動活動見 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)。下面 §1–§5 保留 Phase 0 盤點當時的數字；之後的數字以產生的 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md) 為準。

## 1. 總數

5 個區域、29 座主題島（另有 1 座共用的互動實驗島）、520 堂課：**已發布 80、規劃中 440**。課程只有這兩種狀態（`contentStatusOf`：published、planned；「製作中」目前沒有任何課）。先前紀錄的 5 區域、29 島、520 課、80／440 經核對無誤。

| 區域 | 島數 | 已發布／總數 | 各島（已發布／總數） |
|---|---|---|---|
| 程式與資訊群島 cs | 8 | 80／160 | F 20/20、DS 20/20、AL 20/20、PL 0/20、DB 20/20、CN 0/20、SA 0/20、MIS 0/20 |
| AI 人工智慧群島 ai | 7 | 0／160 | AIF 0/20、ML 0/25、DL 0/25、LLM 0/25、GEN 0/20、AG 0/25、OPS 0/20 |
| 數位設計群島 design | 4 | 0／56 | UI 0/15、UX 0/15、IXD 0/14、DSY 0/12 |
| 網頁與應用開發群島 web | 4 | 0／55 | WEB 0/15、FE 0/15、RWD 0/12、MOB 0/13 |
| 系統與雲端工程群島 sys | 6 | 0／89 | LNX 0/15、DKR 0/15、SRV 0/14、CLD 0/15、CICD 0/15、KUB 0/15 |

## 2. 缺少教材與內容不完整的課

- **缺少教材**：440 堂規劃中的課只有大綱（標題、目標、概念、先修、活動），沒有頁面與連結。
- **已發布但不完整**：80 堂已發布的課全部有完整內容、測驗與練習，通過課綱驗證器與新的發布閘門（見規格 §6；以它們校準）。唯一的一致性缺口：**已發布的 DB16 以規劃中的 PL02 為先修**（另有 DB14～DB16 建議 PL09、PL13、PL14），學習者會被指向一堂還不存在的課。第一批寫完 PL02 即補上。

## 3. 教材架構（可重用的部分）

| 部分 | 位置 | 說明 |
|---|---|---|
| 課程大綱與順序 | `src/content/curriculum/lessons.ts` | 有內容的島（F、D、A、DB）的課；DB 與 PL 的大綱直接取自藍圖（`fromBlueprint`、`programFromBlueprint`） |
| 教材內容 | `src/content/curriculum/content/*.ts` | 每堂一個 `LessonContent`（段落、範例、測驗、練習、視覺化設定） |
| 課程能力 | `schema.ts` `LESSON_CAPABILITIES` | `program-code`、`sql`、`er-diagram`、`normalization`、`query-plan`、`transaction-timeline`、`driver-code`、`protocol-sequence`、`architecture-diagram`、`visualization` |
| 驗證 | `validateCurriculum`、`tests/curriculum*.test.ts`、`src/lib/curriculum/publish-gate.ts` | 欄位、順序、引用、最低數量；範例與練習實際執行（C++、Java、Python、JavaScript、SQL） |
| 共用視覺化 | `registry.ts`、`simulate.ts`、`simulate-algorithms.ts` | 變數、迴圈、陣列、函式呼叫、遞迴、各種資料結構與演算法的逐步 trace |
| 互動實驗（`/learn`） | `src/content/world/labs.ts` | 已實作：六個演算法實驗、色彩與無障礙、Flexbox、CSS Grid、Responsive Layout、Mobile Navigation、Linux Terminal；規劃中：Accessibility Checker、Embedding、Prompt、RAG、Docker、Network Request、CI/CD |
| 路由與導覽 | `src/app/curriculum/[slug]`、`src/lib/nav/site-nav.ts`、`/regions/[region]` | 已發布的課自動產生頁面與側欄連結；規劃中的課只顯示、不連結 |

## 4. 先修與跨島引用

- 先修（`prerequisites`）必須是已發布、而且排在前面的課；建議課（`recommended`）只是提示。
- 跨島、跨區域引用只指向較前面的區域或島（cs → ai → design → web；sys 依 P6 規則），避免循環。
- 有內容的島依世界目錄的順序排列：PL（CS 第 4 島）排在 DB（第 5 島）之前，DB16 → PL02 才合法。

## 5. 建議製作順序

1. **程式語言島 PL01–PL20**：先修只依賴已發布的基礎程式島，完全重用 `program-code`；同時補上 DB16 的先修缺口。（第一批 PL01–PL05）
2. **計算機網路 CN、Linux LNX**：先新增 capability（協定往返、終端機與設定檔），再開課；可重用 `protocol-sequence` 與 Linux Terminal Simulator。
3. 之後依學習路線完整度排列，讓學習者能完整學完一條路線（路線清單見 `learning-paths.json`）。

## 6. 課程開放與 3D 視覺狀態分離（第一批發布時決定）

一座島「有沒有已發布的課」與「3D 地圖怎麼畫它」是兩件事，分開記錄：

| 狀態 | 欄位 | 由誰決定 | 影響 |
|---|---|---|---|
| 課程開放 | `IslandConfig.status`（planned／available／complete） | 由已寫好的課自動推導 | 課綱、側欄、島嶼面板的課程與單元、區域頁的「已開放」計數、DB16 → PL02 這類先修連結 |
| 3D 地景 | `IslandConfig.mapState`（built／planned） | 手動設定（`src/content/world/islands.ts`），不由課程推導 | 區域地圖的地形（規劃中的霧與標記）、世界總覽的低細節島、`island-registry` 的 `visualSpec`、home map 的橋 |

- 程式語言島：`status: 'available'`（5/20），`mapState: 'planned'`：仍是原本的規劃地景，沒有 GLB、沒有重新建模、座標不變。
- 規則：課程全部規劃中的島一定畫成規劃中（地景可以落後課程，不能超前）；`validateIslandRegistry` 檢查地圖實際畫的狀態與 `mapState` 一致；`validateIslandLinks` 的「橋只連地圖上的島」改看 `mapState`。
- 要讓一座島換成自己的地景（模型選版、建模、GLB 整合）是另外的授權階段，完成時才把 `mapState` 改成 `built`。
- 尚未合併的 P9 分支（`p9/1c-camera-flight`、`p9/1c-seamless-navigation`、`p9/8a-navigation-continuity` 等）沒有新增以課程狀態決定地景的程式；它們的區域標題計數來自頁面資料，rebase 到 main 後會顯示「5 座已開放 · 3 座規劃中」，若其 E2E 寫死「4 座已開放」或把程式語言島當成規劃中的範例，需改用 `mapState` 或改選計算機網路島。

規格與佇列見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)，進度見 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md)。
