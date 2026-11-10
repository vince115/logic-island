# 24 CCAR-F 考綱藍圖與知識點矩陣（T.3A）

依據：官方考試指南 1.0 版（Effective July 2026）的 §4 domain 權重、§6 任務陳述與 §17 排除範圍，查證日期 2026-11-05，來源見 doc 23 §1 的 S1。

使用本文件前請注意：

- **任務陳述**一欄是 Logic Island 的繁中意譯，只用來對照，不是官方原文。
- **知識點**一欄是 Logic Island 依官方公開技術文件整理的出題範圍，**不是官方考綱的一部分**。
- 各題數欄都是 **Logic Island 自訂**的題庫配額，不是官方規定。
- 標記規則同 doc 23：官方確認／第三方／未確認／Logic Island 自訂。

## 1. 標籤設計（Logic Island 自訂）

- **考綱標籤**：
  - domain 用 `ccarf.d1`～`ccarf.d5`。
  - 任務陳述用 `ccarf.d1-1`～`ccarf.d5-6`，與 iPAS 的 `ipas.l11101` 相同，每題恰好一個。
  - 每個標籤都帶 `syllabus: { sourceId: 'ccarf-exam-guide-1-0', code: 'D1.1' }`，對到官方任務陳述的編號。
- **子主題標籤**：用 `claude.*` 命名空間。這些是本專案自訂的知識點，可以跨 domain 重用，例如 `claude.agent-sdk.hooks`、`claude.mcp.errors`、`claude.code.claude-md`。
- **易變標籤**：沿用 `meta.volatile` 與 `reviewBy`。所有寫到 API 參數名稱、CLI 旗標、設定檔格式或 SDK 型別名稱的題目，都要標成易變題，見 doc 25 §7。

## 2. 知識點矩陣

欄位說明：

- **MVP** 與 **擴充**：題庫配額。MVP 共 100 題，擴充到 200 題，見 §3。
- **卷**：一份 60 題練習卷中該任務陳述的期望題數（Logic Island 自訂，見 §4）。

### D1 Agentic Architecture & Orchestration（官方權重 27%）

| 代碼 | 任務陳述（意譯） | 知識點（Logic Island 整理） | 候選主題 | MVP | 擴充 | 卷 |
|---|---|---|---|---:|---:|---:|
| D1.1 | 設計 agentic loop 並控制其流程 | 依 `stop_reason`（`tool_use`／`end_turn`）決定是否繼續；把 tool result 放回對話；不靠解析自然語言或任意迴圈上限當主要停止條件 | Claude API、Agent 架構 | 4 | 8 | 3 |
| D1.2 | 用 coordinator 加 subagent 協調多 agent | hub-and-spoke 架構；subagent 的 context 互相隔離；動態挑選 subagent；切分工作範圍以免重疊；反覆精煉的迴圈 | Agent 架構 | 4 | 8 | 2 |
| D1.3 | 設定 subagent 的呼叫、context 傳遞與生成 | Task tool；`allowedTools` 須含 Task；agent 定義；明確傳遞 context，不假設共享記憶；平行生成；fork 式 session | Agent SDK | 4 | 8 | 2 |
| D1.4 | 多步驟工作流程的強制執行與交接 | 程式化強制（hook、前置閘門）與提示式引導的差別；升級給人類時提供結構化交接摘要 | Reliability、Security（間接） | 4 | 8 | 3 |
| D1.5 | 用 SDK hook 攔截工具呼叫並正規化資料 | PreToolUse／PostToolUse 等 hook 的時機；在 hook 中檢查、阻擋或改寫；正規化工具輸出 | Agent SDK、Security（間接） | 4 | 8 | 2 |
| D1.6 | 設計複雜工作流程的任務分解 | 依相依性與 context 預算切分任務；循序與平行的取捨；prompt chaining 與 agent 的選擇 | Agent 架構 | 4 | 8 | 2 |
| D1.7 | 管理 session 狀態、恢復與 fork | 何時恢復、何時 fork；session 狀態保存在哪裡；中斷後的一致性 | Agent SDK、Context 管理 | 3 | 6 | 2 |
| | **小計** | | | **27** | **54** | **16** |

### D2 Tool Design & MCP Integration（官方權重 18%）

| 代碼 | 任務陳述（意譯） | 知識點（Logic Island 整理） | 候選主題 | MVP | 擴充 | 卷 |
|---|---|---|---|---:|---:|---:|
| D2.1 | 設計描述清楚、邊界明確的工具介面 | 工具名稱與描述影響選用；input schema 的必填欄位與列舉；功能重疊的工具如何區隔；粒度的取捨 | Tool Use | 4 | 8 | 3 |
| D2.2 | 讓 MCP 工具回傳結構化錯誤 | `isError`；錯誤類別（暫時性、驗證、權限等）與可否重試；讓模型能據以修正，而不是吞掉錯誤 | MCP、Reliability | 4 | 8 | 2 |
| D2.3 | 在 agent 之間分配工具並設定 `tool_choice` | 最小必要工具集；`tool_choice` 的 auto、any、指定工具與 none；工具太多造成的選擇錯誤 | Tool Use、Security（間接） | 3 | 6 | 2 |
| D2.4 | 把 MCP server 整合進 Claude Code 與 agent 工作流程 | `.mcp.json` 的專案範圍與使用者範圍；環境變數展開，不寫入秘密值；tool 與 resource 的差別 | MCP、Claude Code | 4 | 8 | 2 |
| D2.5 | 選用內建工具 | Read、Write、Edit、Bash、Grep、Glob 各自的適用情境；用 Grep 或 Glob 先找，不整份讀檔 | Claude Code、Agent SDK | 3 | 6 | 2 |
| | **小計** | | | **18** | **36** | **11** |

### D3 Claude Code Configuration & Workflows（官方權重 20%）

| 代碼 | 任務陳述（意譯） | 知識點（Logic Island 整理） | 候選主題 | MVP | 擴充 | 卷 |
|---|---|---|---|---:|---:|---:|
| D3.1 | CLAUDE.md 的階層、範圍與模組化 | 使用者、專案與子目錄三層；`@import` 拆分；哪些內容該放在 CLAUDE.md、哪些不該 | Claude Code、Context 管理 | 4 | 8 | 2 |
| D3.2 | 自訂 slash command 與 skill | frontmatter 的 `allowed-tools`、`argument-hint`、`context: fork`；command 與 skill 的分工 | Claude Code | 4 | 8 | 2 |
| D3.3 | 用路徑專屬規則按需載入慣例 | `.claude/rules/` 搭配 glob；避免 CLAUDE.md 膨脹 | Claude Code、Context 管理 | 3 | 6 | 2 |
| D3.4 | 判斷何時用 plan mode、何時直接執行 | 變更範圍與風險；先探索再實作；小改動直接執行 | Claude Code | 3 | 6 | 2 |
| D3.5 | 反覆精煉的技巧 | 給輸入／輸出範例；測試驅動；訪談式釐清需求 | Claude Code、Evaluation（間接） | 3 | 6 | 2 |
| D3.6 | 把 Claude Code 整合進 CI/CD | 非互動模式 `-p`；`--output-format json`；以 schema 約束輸出；CI 中的權限與工具限制 | Claude Code、Production（部分） | 3 | 6 | 2 |
| | **小計** | | | **20** | **40** | **12** |

### D4 Prompt Engineering & Structured Output（官方權重 20%）

| 代碼 | 任務陳述（意譯） | 知識點（Logic Island 整理） | 候選主題 | MVP | 擴充 | 卷 |
|---|---|---|---|---:|---:|---:|
| D4.1 | 寫出明確準則以提高精確度、降低誤報 | 具體判準取代模糊形容詞；說明「為什麼」；界定什麼不算 | Prompt Engineering | 4 | 8 | 2 |
| D4.2 | 用 few-shot 提升一致性 | 範例的代表性與多樣性；邊界案例；範例與指示衝突時的風險 | Prompt Engineering | 3 | 6 | 2 |
| D4.3 | 用 tool use 加 JSON Schema 強制結構化輸出 | 以工具的 input schema 取得結構化資料；必填與 nullable；schema 合法不代表語意正確 | Tool Use、Claude API | 4 | 8 | 2 |
| D4.4 | 設計抽取品質的驗證、重試與回饋迴圈 | 程式驗證後把錯誤回饋重試；重試上限；何時改送人工 | Reliability、Evaluation（間接） | 3 | 6 | 2 |
| D4.5 | 設計高效率的批次處理 | Message Batches API 的適用情境（不需即時、量大）；結果與請求的對應 | Claude API | 3 | 6 | 2 |
| D4.6 | 設計多實例、多輪次的審查架構 | 生成與審查分離；獨立審查者；彙整多個意見 | Evaluation（間接）、Agent 架構 | 3 | 6 | 2 |
| | **小計** | | | **20** | **40** | **12** |

### D5 Context Management & Reliability（官方權重 15%）

| 代碼 | 任務陳述（意譯） | 知識點（Logic Island 整理） | 候選主題 | MVP | 擴充 | 卷 |
|---|---|---|---|---:|---:|---:|
| D5.1 | 在長互動中保留關鍵資訊 | 萃取並保存關鍵事實；scratchpad；壓縮時的取捨；lost-in-the-middle | Context 管理 | 3 | 6 | 2 |
| D5.2 | 設計升級與釐清模糊需求的模式 | 何時該問、何時該升級；升級條件寫成可判斷的規則 | Reliability | 3 | 6 | 2 |
| D5.3 | 多 agent 系統的錯誤傳遞 | 部分失敗時回報什麼；不讓 subagent 的錯誤被靜默吞掉；回傳結構化錯誤 | Reliability、Agent 架構 | 2 | 4 | 1 |
| D5.4 | 探索大型 codebase 時管理 context | 交給 subagent 探索、只回傳摘要；先搜尋再讀檔 | Context 管理、Claude Code | 3 | 6 | 2 |
| D5.5 | 人工審查流程與信心校準 | 以有標記的資料校準信心門檻；分層抽樣估計錯誤率；低信心改送人工 | Evaluation（間接）、Reliability | 2 | 4 | 1 |
| D5.6 | 多來源綜整時保留出處並處理不確定性 | 每個結論附來源；來源互相矛盾時明白標示，不自行裁定 | Reliability | 2 | 4 | 1 |
| | **小計** | | | **15** | **30** | **9** |

**合計**：MVP 100 題、擴充 200 題、每卷 60 題。

## 3. 配額原則（Logic Island 自訂）

1. **domain 配額照官方權重**：
   - 100 題 × 27/18/20/20/15% 剛好是 27/18/20/20/15，200 題則是兩倍。
   - 60 題卷 × 權重得到 16.2/10.8/12/12/9，四捨五入為 16/11/12/12/9，總和恰好 60。
2. **任務陳述配額**：同一 domain 內大致平均分配。核心技術點（D1.1、D1.4、D2.1、D2.2、D4.3）稍多。
   - 每項至少 2 題，抽卷時每項至少可選 2 題。
   - 擴充題庫是 MVP 的兩倍，使每項題庫數至少是每卷題數的 2 倍，延續 iPAS 的作法。
3. **Security 與 Production Deployment 不設獨立配額**：官方考綱沒有對應的 domain（doc 23 §6），只在 D1.4、D1.5、D2.3、D2.4、D3.6 的情境內出題。
   - 擴充後，這兩類情境合計目標不少於 20 題，但仍計入原屬任務陳述的配額。
4. **排除範圍不出題**：§4.2 的 14 項排除範圍一律不出題，例如 streaming、計價、computer use、prompt caching 的實作細節。
5. **權重以官方為準**：官方說權重只是「大約」比例，所以 Logic Island 卷面嚴格照 §2 的「卷」欄。官方指南改版時，先改本表再改題庫。

## 4. 模擬卷結構（Logic Island 自訂，非官方）

| 項目 | 官方（doc 23 §3） | Logic Island 練習卷 |
|---|---|---|
| 題數 | 60 | 60 |
| 時間 | 120 分鐘 | 120 分鐘（另提供 150 分鐘延長練習模式） |
| 題型 | 單選與複選 | MVP：單選。複選從 T.3C 起，題庫目標約 15% |
| 情境 | 6 個情境中隨機抽 4 個，全部是情境題 | MVP：每題附獨立的短情境。T.3C 起：情境組，每組一個共用情境加 5 題 |
| 配額 | domain 權重 | §2「卷」欄，每任務陳述的配額為硬規則 |
| 計分 | 尺度分數 100–1,000，720 及格 | 原始分數與答對率；**不換算尺度分數**，也不顯示「通過」 |

推論與限制：

- 官方是 4 個情境、60 題。從題數推論每個情境約 15 題，但官方**未明說**每情境題數，所以這只是推論。
- Logic Island 的情境都是原創，不沿用官方的 6 個情境名稱與設定（doc 23 §4.1）。

## 5. 待人工確認

- 任務陳述的繁中意譯是否精確：每項應有一名具 Claude 實作經驗的審稿者，對照官方原文確認。
- 知識點欄的 API 名稱、CLI 旗標與設定檔格式：出題前須以當時的官方技術文件逐項核對，並標成易變題。
- 「卷」欄的取整與核心點加權：在首批 100 題完成審核前可以調整，調整時要同步修改本表與 blueprint 資料。
