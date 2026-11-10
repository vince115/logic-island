# 23 CCAR-F 官方資料研究（T.3A）

- 研究日期：2026-11-05。
- 研究範圍：只蒐集認證本身的官方事實，包括名稱、考綱、題型、題數、時間、計分、資源與版本，不蒐集任何考題。
- 研究方式：以 Anthropic 官方來源為主，第三方資訊另外分節列出。
- 官方考試指南的範例題只確認「有幾題」，沒有抄錄、改寫或摘要題目內容。
- 練習題網站、題庫網站與考生回憶題一律未開啟、未使用。

本文件的每一項事實都標註以下四種狀態之一：

| 標記 | 意義 |
|---|---|
| **官方確認** | 由下列官方來源直接載明 |
| **第三方** | 只見於非官方網站；不作為本專案的依據 |
| **未確認** | 官方沒有提到，或官方來源之間互相衝突 |
| **Logic Island 自訂** | 本專案模擬考自行決定的設定。不是官方規則，見 doc 25 |

## 1. 官方來源

| 代號 | 來源 | URL | 查證日期 |
|---|---|---|---|
| S1 | Claude Certified Architect – Foundations Exam Guide，Version 1.0，Effective July 2026（PDF） | 由 S2 報名頁連結：`https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F6nizmqk8tpzpfjvt6qmmav7rh%2Fpublic%2F1783542750%2FClaude+Certified+Architect+%E2%80%93+Foundations+Exam+Guide.pdf` | 2026-11-05 |
| S2 | 官方報名與認證頁（Anthropic Partner Academy） | https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification | 2026-11-05 |
| S3 | 認證 FAQ | https://anthropic-partners.skilljar.com/page/faq-certifications | 2026-11-05 |
| S4 | 報考資格 | https://anthropic-partners.skilljar.com/page/certification-eligibility | 2026-11-05 |
| S5 | 官方準備課程 | https://anthropic-partners.skilljar.com/page/claude-certified-architect-foundations-prep-courses | 2026-11-05 |
| S6 | Anthropic 新聞稿：Claude Partner Network（2026-03-12） | https://www.anthropic.com/news/claude-partner-network | 2026-11-05 |
| S7 | Claude 文章：four role-based Claude certifications（2026-07-23） | https://claude.com/resources/articles/four-role-based-claude-certifications | 2026-11-05 |

- S1 是官方明言的權威參考（authoritative reference），所以考試規則一律以 S1 為準。
- S1 與 S3 衝突時，兩者並列，標為「未確認」。
- 原始 PDF 與抽出的文字只留在本機 scratchpad 作查證用，沒有放進版本控制。
- 本機抽取文字中，S1 的封面列有版本、生效月份與考試代碼，§3 的考試資訊表與 §4 的 domain 權重表都已逐字核對（2026-11-05）。

## 2. 認證基本資料

| 項目 | 內容 | 狀態 | 來源 |
|---|---|---|---|
| 正式名稱 | Claude Certified Architect – Foundations | 官方確認 | S1 封面、S7 |
| 考試代碼 | **CCAR-F**，與本專案縮寫相同 | 官方確認 | S1 封面、§3 |
| 常見寫法「CCA-F」 | 不是官方代碼 | 第三方 | 部落格與練習題網站 |
| 發證計畫 | Anthropic 的 Claude Certification Program。在 Anthropic Partner Academy（Skilljar）報名，由 Pearson VUE 施測，數位徽章由 Credly 發放 | 官方確認 | S1 §11、S7 |
| 發布 | 2026-03-12，與 Claude Partner Network 同時公布 | 官方確認 | S6 |
| 報考資格 | 須任職於 Claude Partner Network 成員組織，並以該組織網域的 email 報名。年滿 18 歲，備有政府核發的身分證件 | 官方確認 | S4 |
| 先修條件 | 沒有正式先修條件。建議具備 6 個月以上 Claude API、Agent SDK、Claude Code 與 MCP 的實作經驗 | 官方確認 | S1 §2、S3 |
| 目標考生 | 設計並實作 Claude 正式環境應用的 solution architect | 官方確認 | S1 §2 |
| 考試指南版本 | 1.0，Effective July 2026。修訂紀錄：0.1（2026-02）、0.2（2026-06）、1.0（2026-07，排版更新） | 官方確認 | S1 §18 |
| 1.0 版之後的更新 | 截至 2026-11-05，報名頁連結的仍是 1.0 版 | 官方確認（查證當日） | S2 |

本專案的推論是：這張認證只開放夥伴組織成員報考，所以 Logic Island 的使用者大多無法實際應考。因此 CCAR-F 島的定位是「依官方考綱學習 Claude 架構」，不是「應考保證」（doc 25 §1）。

## 3. 考試形式與計分

| 項目 | 內容 | 狀態 | 來源 |
|---|---|---|---|
| 題數 | 60 題 | 官方確認 | S1 §3 |
| 題型 | 單選（multiple-choice）與複選（multiple-response）。每題會註明要選幾個答案 | 官方確認 | S1 §3 |
| 情境 | 全部是情境題。每場從 6 個情境中隨機抽 4 個 | 官方確認 | S1 §3、§5 |
| 作答時間 | 120 分鐘。FAQ 建議預留約 135 分鐘的座位時間 | 官方確認 | S1 §3、S3 |
| 施測 | 監考，可選線上（OnVUE）或 Pearson 考場。閉卷，不得使用 AI 或翻譯工具 | 官方確認 | S1 §3、§11、§13，S3 |
| 費用 | 125 美元（2026-06-30 起，之前是 99 美元），部分夥伴等級另有折扣 | 官方確認 | S1 §3、S3、S2 |
| 語言 | 英文、日文 | 官方確認 | S3（S1 未列） |
| 計分 | 尺度分數 100–1,000，720 分及格。屬標準參照，切分點由 standard-setting 研究訂定 | 官方確認 | S1 §3、§10 |
| 成績單 | 列出各 domain 的答對百分比，但不影響及格與否 | 官方確認 | S1 §10 |
| 原始分數如何換成尺度分數 | 官方沒有公布換算方式 | 未確認 | — |
| 不計分（pretest）題 | S1 與 S3 都沒有提到 | 未確認 | — |
| 部分給分（複選題） | 官方沒有說明複選題能否部分給分 | 未確認 | — |
| 重考 | 第 1、2、3 次未通過後，分別要等 14、30、90 天。滾動 12 個月內最多考 4 次，每次都要付費 | 官方確認 | S1 §12、S3 |
| 取消與改期 | S1 寫考前 24 小時以前，S3 寫 48 小時，兩者衝突 | 未確認 | S1 §11、S3 |
| 有效期 | 12 個月。如期更新只需完成免費、非監考的線上評量；過期須付全額重考 | 官方確認 | S1 §15、S3 |
| 保密 | 考前須同意保密協議，考題、選項與情境都是 Anthropic 的機密 | 官方確認 | S1 §14 |

「60 題、120 分鐘、720／1,000」只能照官方原樣陳述。Logic Island **不能**把 720 分換算成「答對 72%」或其他百分比，因為官方沒有公布換算方式，見 doc 25 §6。

## 4. 官方考綱（domain 與權重）

| # | Domain | 權重 | 任務陳述數 | 狀態 |
|---|---|---:|---:|---|
| D1 | Agentic Architecture & Orchestration | 27% | 7 | 官方確認（S1 §4、§6） |
| D2 | Tool Design & MCP Integration | 18% | 5 | 官方確認 |
| D3 | Claude Code Configuration & Workflows | 20% | 6 | 官方確認 |
| D4 | Prompt Engineering & Structured Output | 20% | 6 | 官方確認 |
| D5 | Context Management & Reliability | 15% | 6 | 官方確認 |

- 官方說明，權重是計分題的「大約」比例。
- 30 項任務陳述的意譯與知識點矩陣都在 doc 24。這裡只摘錄 domain 層級，不轉錄官方原文。

### 4.1 六個考試情境

官方的情境清單（S1 §5）只記錄名稱與相關 domain，不記錄情境內容：

| # | 情境 | 主要 domain |
|---|---|---|
| 1 | Customer Support Resolution Agent | D1、D2、D5 |
| 2 | Code Generation with Claude Code | D3、D5 |
| 3 | Multi-Agent Research System | D1、D2、D5 |
| 4 | Developer Productivity with Claude | D2、D3、D1 |
| 5 | Claude Code for Continuous Integration | D3、D4 |
| 6 | Structured Data Extraction | D4、D5 |

Logic Island 不會沿用這 6 個情境的名稱與設定來出題，而是自行撰寫情境，見 doc 25 §4。

### 4.2 官方明列的排除範圍（S1 §17，官方確認）

以下主題不在考試範圍內。題庫不出這些題目，只在必要時當作背景知識。

- 微調模型
- API 驗證、帳務與帳號管理
- 部署或託管 MCP server
- 模型內部架構、Constitutional AI 與 RLHF
- embedding 與向量資料庫
- computer use
- vision
- streaming 與 SSE
- rate limit 與計價
- OAuth 與金鑰輪替
- 雲端供應商的設定
- 基準測試
- prompt caching 的實作細節（只需知道它存在）
- tokenization 細節

## 5. 官方學習資源（官方確認）

- **考試指南（S1）**：
  - §7 有準備策略。
  - §8 有 4 個實作練習：
    - 有升級邏輯的多工具 agent
    - 團隊用的 Claude Code 設定
    - 結構化資料抽取管線
    - 多 agent 研究管線
  - 附錄列出技術名詞與 Claude Code CLI 旗標。
- **官方範例題**：S1 §9 收錄 12 題附解析的範例題，取自已停用的舊練習測驗（S3 說明舊平台的練習考已隨轉到 Pearson 而停用）。
  - 官方沒有明示這些範例題的授權條款，所以視為 Anthropic 的著作。
  - **Logic Island 不複製、不改寫，也不以它們為出題模板。**
- **免費準備課程（S5）**，共 7 門：
  - AI Fluency: Framework & Foundations
  - Building with the Claude API
  - Claude on Google Cloud
  - Claude Code in Action
  - Claude 101
  - Claude with Amazon Bedrock
  - Introduction to Model Context Protocol
- **技術文件**：Claude API、Agent SDK、Claude Code 與 MCP 的官方文件。

Logic Island 出題時，解析引用的是公開的技術文件，不引用考試內容，見 doc 25 §5。

## 6. 研究候選主題與官方考綱的對照

任務說明中列出的 11 個候選主題只是研究起點，**不是官方考綱**。逐項對照官方考綱的結果如下：

| 候選主題 | 官方是否涵蓋 | 對應 domain 與說明 |
|---|---|---|
| Claude API（Messages） | 涵蓋 | 分散在各 domain：D1 的 `stop_reason` 迴圈；D4 的 tool use、`tool_choice` 與 Message Batches（4.5）。API 驗證與帳務排除 |
| Claude Agent SDK | 核心 | D1：agentic loop、subagent、hook、session 與 fork |
| Tool Use | 涵蓋 | D2（介面設計、錯誤回傳、工具分配）、D4.3（結構化輸出） |
| MCP | 涵蓋 | D2.2、D2.4。部署與託管 MCP server **排除** |
| Prompt Engineering | 涵蓋 | D4 |
| Context Management | 部分 | D5（長互動、大型 codebase）。prompt caching 只需知道存在，實作細節排除 |
| Agent Architecture | 核心、權重最大 | D1（27%） |
| Evaluation | 間接 | 沒有獨立 domain。相關內容在 5.5（信心校準、抽樣量測）、4.4（驗證迴圈）、4.6（多輪審查）與 3.5（測試驅動）。依 S7，完整的評估框架屬於更高級別的認證 |
| Reliability | 涵蓋 | D5（升級、錯誤傳遞、人工審查）、D1.4（程式化強制） |
| Security | 弱、間接 | 考綱**沒有** prompt injection 的任務陳述。權限只以工具限制形式出現：`allowedTools`、`allowed-tools`、在 agent 間分配工具，以及錯誤分類中的 permission error。OAuth 與金鑰輪替排除 |
| Production Deployment | 部分 | 整份考試以正式環境為框架，CI/CD 在 D3.6。基礎設施、託管與雲端設定排除 |

這份對照對題庫的影響如下：

- Security 與 Production Deployment **不設獨立配額**，只在 D1、D2、D3 的任務陳述內出題，見 doc 24 §3。
- Evaluation 併入 D4 與 D5 的相關任務。

## 7. 第三方資訊（不作為依據）

- 不少網站把考試代碼寫成「CCA-F」或「CCA-001」，官方代碼是 CCAR-F。
- 第三方網站的價格說法互相矛盾（免費、99 美元、125 美元），以 S3 為準。
- 部分網站寫發布日是 2026-03-13，以 S6 的 2026-03-12 為準。
- 有大量「practice test」與「題庫」網站。本研究沒有開啟或使用這些網站：這類內容可能含回憶題或洩題，**一律排除**，也不作為相似性比對以外的任何用途。

## 8. 未確認與需要追蹤的事項

| 項目 | 處理方式 |
|---|---|
| 原始分數如何換算尺度分數、是否有不計分題、複選題能否部分給分 | 模擬考不宣稱與官方換算一致，計分規則標為「Logic Island 自訂」（doc 25 §6） |
| 取消與改期的時限（24 或 48 小時） | 與題庫無關，只記錄在此 |
| 考試指南改版 | 每 90 天重新查證 S1 與 S2。版本號變更時，doc 24 的矩陣與配額都須重新核對（doc 25 §8） |
| Certification Terms 與 Exam Policy 兩份 PDF | 本輪沒有逐條閱讀。發布任何 CCAR-F 內容前，須由人工閱讀並確認沒有限制「依考綱製作練習題」 |
| S1 範例題的授權 | 沒有明示授權，一律不使用 |
