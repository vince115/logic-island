# 正式教材規格（Course Content Specification）

> 2026-11-20，課程生產流程（Course Production Pipeline）的 Phase 1。把一堂 `planned` 課變成可以學、可以練習、可以驗證的正式教材時，以本文件為準。它**延伸而不取代**既有規範：撰寫步驟與程式碼規則見 [CONTENT_AUTHORING_GUIDE](CONTENT_AUTHORING_GUIDE.md)，欄位見 [LESSON_CONTENT_SCHEMA](LESSON_CONTENT_SCHEMA.md)；兩者對 F、D、A、DB 四島 80 堂課已實際驗證過。

## 1. 一堂正式課必須有的東西

| 部分 | 要求 | 由誰檢查 |
|---|---|---|
| 學習目標 | 3–5 個可驗證的目標（「能判斷…」「能寫出…」，不寫「了解…的重要性」）；先修課在 `prerequisites`，只能指向已開放的課 | `validateCurriculum`、發布閘門 |
| 為什麼要學 | `motivation`：這個主題能解決什麼問題，具體一兩句 | 發布閘門 |
| 核心教材 | 至少 3 段：概念、關鍵術語（首次出現附英文）、運作原理、實際使用情境；至少一個 `warning` callout 寫常見錯誤與迷思 | `validateCurriculum`、發布閘門（每段不得空洞） |
| 實務範例 | 依學科形式（§2），至少 3 個，各示範不同重點，結果可驗證 | 學科對應的自動測試 |
| 互動教學 | 只用已實作的共用視覺化或活動（§3）；不適合就設 `none`，用表格與逐步說明代替，不放假的互動 | 發布閘門 |
| 練習與評量 | 至少 4 題測驗（混合程式閱讀、結果推理、錯誤辨識），每題有解析說明對與錯的理由；至少 1 題練習，含一般、邊界與錯誤（或 `errorPolicy`）測資 | `validateCurriculum`、發布閘門、`curriculum-code.test.ts` |

教材品質優先於篇幅：寫給第一次學的人，先說為什麼，再說怎麼做，最後說常見錯誤；避免「非常重要」「本節介紹」這類空話。

## 2. 依學科調整範例形式

| 學科 | 範例的形式 | 怎麼驗證 |
|---|---|---|
| 程式語言（F、PL、演算法） | C++、Java、Python、JavaScript 可執行的短程式，用各語言自然的寫法；語言行為不同時寫 `outputByLanguage` 並在正文解釋 | 測試實際編譯並執行每一段，比對輸出 |
| 資料結構 | 操作與狀態變化，由模擬器（`simulate.ts`）產生步驟 | 驗證器比對面板資料 |
| 資料庫 | SQL 範例與練習，在 SQL 練習場執行 | SQL 測試實際執行 |
| 網路工程（CN、SRV） | 封包欄位、協定往返（`protocol-sequence`）、資料流圖；實際指令的輸出用固定的範例資料 | CN：`network-protocol` 能力（CN-0）；SRV：沿用 `terminal`（引擎階段 E10 起的 socket、DNS、HTTP）加上 `network-protocol` 的情境（SRV-0），不需要新的 capability |
| Linux／Docker（LNX、DKR） | 命令、設定檔與執行結果；可用 Linux Terminal Simulator 的模擬檔案系統 | LNX：`terminal` 能力（LNX-0），範例重播到完全相同的輸出、練習以結果檢查；DKR 需要新增 capability（§4） |
| AI | 資料、模型與推論流程；數值用預先計算的小資料，不呼叫真實模型 | 需要新增 capability（§4） |
| UI／UX、網頁 | 設計案例與互動比較；CSS 範例可在 Flexbox、Grid、Responsive 實驗中重現 | 需要新增 capability（§4） |

## 3. 互動：先重用

- 程式課：共用 trace 視覺化（`variable-state`、`function-call`、`recursion-trace`…）由步驟資料描述，不為一堂課寫新元件。
- 大綱上的活動還沒實作時（例如 PL 的 `type-checker`、`memory-model`），改用已實作的視覺化或 `none`，不要做假的互動元件；需要新活動時另案評估成可重用的共用元件。
- 跨島共用的互動實驗（`/learn/*`）可在正文連結，不在課程內重做。

## 4. 新學科的課程能力（capability）

課程以 `capabilities` 宣告教學與練習的方式（`program-code`、`sql`、`protocol-sequence`…）。程式語言島（PL）完全使用 `program-code`，所以第一批從它開始。網路、Linux、AI、設計等學科要先新增對應的 capability（內容欄位、頁面區塊與自動驗證），不能把它們硬塞成三語程式課，也不能沒有驗證就開放。新增 capability 屬架構變更，另案進行。

2026-11-21（CN-0）：新增 `network-protocol`（固定的網路情境：節點、依序的訊息與各層標頭、節點表格；練習答案從情境讀出或計算），規格與隔離見 [CN0_NETWORK_CAPABILITY](CN0_NETWORK_CAPABILITY.md)。計算機網路島以「預備島嶼」（`PREPARED_ISLAND_IDS`）登錄：可以撰寫與驗證課程，但第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前不會出現任何頁面。自主課程生產的佇列與恢復方式見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)（由 `scripts/curriculum-queue.ts` 計算）。

## 5. 生產流程

1. 依先修關係與重用價值選一批 5–10 堂（§7 佇列）。
2. 每堂一個撰寫者（一個 `content/<id>.ts` 只有一個寫入者），在私人副本完成並自我驗證：`validateCurriculum`、發布閘門、該堂的程式碼測試（Java 不得略過）、`tsc`。
3. 整合者在獨立 worktree 登錄大綱（`lessons.ts` 的 `programFromBlueprint`：標題、目標、概念與先修取自藍圖，不得偏離）、單元（`units.ts`），重跑全部驗證，逐題校對測驗答案，並在桌機與手機檢查頁面。
4. 全部通過才把狀態改為 `complete`，commit、push，經 PR 與 CI 合併；正式部署遵循既有流程。
5. 發布課程不改 3D 地景：島嶼的地形由 `IslandConfig.mapState` 手動決定，不隨課程開放而改變（見 [COURSE_INVENTORY](COURSE_INVENTORY.md) §6）。島上第一批課發布時，只會改變課綱、側欄、島嶼面板與區域頁的計數；若測試把該島當成「規劃中」的範例，改用仍規劃中的島，不把已發布的課改回規劃中。

## 6. 發布閘門（`src/lib/curriculum/publish-gate.ts`）

`complete` 的課必須通過 `validateCurriculum` 與發布閘門。閘門擋下：沒有內容；目標少於 3 個或無法檢查；`TODO`、`FIXME`、`TBD`、lorem ipsum、待補等未完成文字；空洞的段落（少於 80 字）；範例、測驗題數不足；答案不在選項內、選項重複或少於 3 個、解析少於 25 字的題目；沒有測資的練習；未實作的視覺化或不存在的活動；正文幾乎沒有提到這堂課自己的概念（內容與主題不符）。先修與建議課的引用由 `validateCurriculum` 檢查：先修必須是已開放而且排在前面的課；建議課可以是分批撰寫中島嶼的大綱課。閘門以既有 80 堂校準（全部通過），不得為了讓某堂課通過而放寬。

## 7. 製作佇列

| 批次 | 課程 | 理由 |
|---|---|---|
| 1（已發布，PR #30） | PL01–PL05 | 程式語言基礎；先修只有已開放的基礎程式島課；完全重用 `program-code` 與共用視覺化；補上已開放的 DB16 所要求的 PL02 |
| 2（已發布，PR #31） | PL06–PL10 | 同一條路線連續：作用域與閉包、記憶體模型、垃圾回收、錯誤處理、詞法分析 |
| 3（已發布，PR #34） | PL11–PL15 | 語法分析、直譯器、並行模型；AST 與並行時間軸以既有的樹、框架、容器與表格面板表達，新引擎列入 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md) |
| 4（已發布，PR #37） | PL16–PL19 | 編譯流程、虛擬機與 JIT、超程式設計、語言設計取捨；CFG 以圖面板、VM 以堆疊容器、裝飾器以呼叫框架表達，語言設計以比較表格；`compiler-pipeline`、`ast-explorer`、`case-study-board` 列入 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md) |
| 5（已發布，PR #39） | PL20 | 程式語言島綜合挑戰（`challenge-stages`）：四語各寫含閉包與型別檢查的迷你語言，篇幅最大，單獨一批 |
| CN-0（架構，PR #46） | — | `network-protocol` capability、計算機網路島登錄為預備島嶼（[CN0_NETWORK_CAPABILITY](CN0_NETWORK_CAPABILITY.md)） |
| CN-1（PR #47）、CN-2（PR #48）、CN-3（PR #49）、CN-4（PR #50）、CN-5，見 [NETWORKS_ISLAND](NETWORKS_ISLAND.md) | CN01–CN05、CN06–CN10、CN11–CN15、CN16–CN19、CN20 | 課程編號即位置，只能依序連續發布；同島先修都排在前面，所以依編號就是拓樸順序 |
| AIF-0（架構） | — | `python-code` 能力、AI 基礎島登錄為預備島嶼（[AIF0_PYTHON_CAPABILITY](AIF0_PYTHON_CAPABILITY.md)） |
| AIF-1 至 AIF-5（全島完成，見 [AI_FOUNDATIONS_ISLAND](AI_FOUNDATIONS_ISLAND.md)） | AIF01–05、06–10、11–15、16–19、20 | 依編號連續發布 |
| LNX-0（架構） | — | `terminal` 能力（模擬終端機的機器、重播的指令紀錄與以結果檢查的練習）、Linux 系統島登錄為預備島嶼（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）；LNX-1 至 LNX-5 依引擎階段 E1–E9 依序發布 |
| LNX-1（見 [LINUX_SYSTEMS_ISLAND](LINUX_SYSTEMS_ISLAND.md)） | LNX01–04 | 引擎階段 E1（`files` profile）＋前四課；系統與雲端工程群島第一次有已開放的課 |
| LNX-2 | LNX05–07 | 引擎階段 E2（`streams`）、E3（`users`）＋三課 |
| LNX-3 | LNX08–11 | 引擎階段 E4–E6（`processes`、`packages`、`services`）＋四課 |
| LNX-4 | LNX12–14 | 引擎階段 E7–E9（`remote`、`scripting`、`scheduling`）＋三課 |
| LNX-5 | LNX15 | 綜合專題（challenge-stages 六關），全島完成 |
| SRV-1（見 [NETWORK_SERVERS_ISLAND](NETWORK_SERVERS_ISLAND.md)） | SRV01–03 | 引擎階段 E10–E12（`sockets`、`dns`、`http`）＋三課；網路與伺服器島開放 |
| SRV-2 | SRV04–06 | 引擎階段 E13–E14（`tls`、`nginx`）＋三課 |
| SRV-3 | SRV07–10 | 引擎階段 E15–E17（`proxy`、`firewall`、`tunnels`）＋四課 |
| SRV-4 | SRV11–13 | 引擎階段 E18–E19（`edge`、`diagnostics`）＋三課 |
| SRV-5 | SRV14 | 綜合專題（challenge-stages 六關），全島完成 |
| SRV-0（架構） | — | 網路與伺服器島登錄為預備島嶼，沿用 `terminal` 與 `network-protocol` 能力（`serverFromBlueprint`）；引擎階段 E10–E12（`sockets`、`dns`、`http`）先完成（[SRV0_SERVER_CAPABILITY](SRV0_SERVER_CAPABILITY.md)）；SRV-1 至 SRV-5 依引擎階段 E10–E19 依序發布 |
| 之後 | 依 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 自動選擇 | 先修已滿足、能力已備妥、解鎖其他島最多的島優先；缺少的共用能力先做最小可用版本 |

進度記錄在 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md)。
