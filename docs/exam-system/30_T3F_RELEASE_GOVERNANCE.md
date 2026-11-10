# 30 T.3F 發布治理、舊版內容完整性與發布準備

日期：2026-11-09。範圍：補上舊版（第 1 版）雜湊題目的內容完整性防護，盤點並補齊審核／核准／發布／撤回的完整生命週期，在隔離環境演練發布與撤回，準備 CCAR-F 優先 1 題目的人工審核資料，建立版本敏感題的查證流程，強化 Release Preflight 與 CI，並完成跨認證回歸。

**本輪沒有任何題目被核准、發布或撤回**，也沒有建立人工核准紀錄。CCAR-F 150 題與 iPAS 200 題全部維持 `in-review`；53 題既有已發布題與 57 筆 published hash 逐字不變；真實帳本（`src/content/trials/ledger.json`）仍是 0 筆審核、0 筆發布，檔案沒有被改寫。演練用的核准與發布全部是記憶體中的 **SYNTHETIC** 紀錄。所有 CI 結果都是**本機驗證**：沒有 push，GitHub 上的 CI 沒有執行過。

前置文件：[19 審核與發布流程](19_T2C_REVIEW_PUBLICATION_LIFECYCLE.md)、[22 發布前檢查](22_T2F_RELEASE_READINESS.md)、[29 150 題擴充與題庫治理](29_CCARF_150_QUESTION_BANK_GOVERNANCE.md)

## 1. 基準（開始時）

| 項目 | 值 |
|---|---|
| Branch／HEAD | `trials/mvp`／`9e46322`（符合預期）；工作樹只有 Theme Session 的 5 個檔案與 `.claude/`（diff checksum `f612b09…`，結束時相同） |
| 其他 worktree | `logic-island-m3-ring`（另一個 branch，未觸碰） |
| 題目 | 403 題：CCAR-F 150、iPAS 200、既有已發布 53（APCS、MOEX、Bank IT 的固定卷）；350 題審稿中、53 題已發布 |
| 版本與雜湊 | 429 個版本：舊版雜湊 387、第 2 版 42。含舊版雜湊版本的題目 361 題（iPAS 200、既有已發布 53、CCAR-F A–E 108） |
| published hash | 57 筆（`tests/fixtures/published-hashes-baseline.json`） |
| 帳本 | 1 位審核者（`owner`），0 筆審核、0 筆發布，沒有撤回機制 |
| CCAR-F 優先 1 | 31 題；版本敏感題 76 題（另有 iPAS 13 題） |

更正：T.3E 報告說「308 題仍用舊版雜湊」不正確。308 是當時審稿中的題數；仍以舊版雜湊為身分的題目是 361 題（含 53 題已發布題）。

## 2. 舊版雜湊稽核

### 2.1 兩種雜湊實際涵蓋的欄位

| 欄位 | 舊版雜湊（第 1 版） | 第 2 版雜湊 | 完整性 manifest（本輪） |
|---|---|---|---|
| 題幹、選項 | 涵蓋 | 涵蓋 | 涵蓋 |
| 正解、選取數 | 涵蓋 | 涵蓋 | 涵蓋 |
| 配分 | 涵蓋 | 涵蓋 | 涵蓋 |
| 解析 | **不涵蓋** | 涵蓋 | 涵蓋 |
| 各選項解析 | **不涵蓋** | 涵蓋 | 涵蓋 |
| 題型、版本號、雜湊版本、顯示權限 | 不涵蓋 | 不涵蓋 | 涵蓋（`config`） |
| 標籤、參考文件、易變資訊、難度 | 不涵蓋 | 不涵蓋 | 不涵蓋（營運中繼資料） |

### 2.2 已有的保護

- 審核、核准、發布紀錄綁定「題號＋版本＋雜湊」，所以舊核准不會轉移到新版本。
- importer 會比對學習者看得到的全部內容，包括解析與難度；有變更時必須附 `change` 說明，並產生新版本。
- 已發布版本的雜湊寫在 published-hashes.json，且受 baseline 凍結。
- Session 會凍結每題的版本與雜湊，還原時逐題比對。

### 2.3 繞過 importer 的直接編輯路徑（威脅模型）

| # | 路徑 | T.3E 之前能否偵測 | T.3F 之後 |
|---|---|---|---|
| T1 | 直接改 `generated/*.json` 裡舊版題目的解析或選項解析（舊版雜湊不變） | **不能** | manifest 檢查失敗（`explanation`／`optionExplanations`） |
| T2 | 直接改 generated 檔的正解、題幹、選項或配分 | 已發布題目才能（published hash 不符）；審稿中題目不能 | manifest 檢查失敗，並列出新舊雜湊 |
| T3 | 直接改顯示權限或題型 | 不能 | manifest 檢查失敗（`config`） |
| T4 | 把舊版本改標為 `hashVersion: 2`，或改寫版本號、刪除版本 | 部分（validateTrials 會擋雜湊版本倒退） | manifest 檢查失敗（`config`／`missing`） |
| T5 | 改 batch 檔並刪除舊的 generated 檔再重新匯入（就地覆寫第 1 版） | 不能 | manifest 檢查失敗（manifest 記得原本內容） |
| T6 | 直接改 ledger.json，加入核准或發布 | checkLedger 與 preflight 會擋（雜湊、角色、時序） | 另外會擋 SYNTHETIC 紀錄、撤回後的重新發布規則 |
| T7 | 直接改 published-hashes.json | baseline 回歸檢查會擋 | 不變 |
| T8 | 同時改 generated 檔與 manifest，讓兩者一致 | — | 單一 commit 內無法偵測；CI 會把 manifest 與 base commit 比對，舊條目被改寫或刪除就失敗（只允許新增）。仍需靠 code review 審閱 diff |
| T9 | 用 `--append` 把未審閱的新版本加入 manifest | — | `--append` 只新增 manifest 沒見過的版本；只要已記錄版本有任何不一致就拒絕；必須用 `--confirm N` 明確確認。新版本仍是 `in-review`，需要人工審核 |

Git 歷史稽核（唯讀）：從第一次產生 generated 檔起共 20 個 commit，429 個版本全部檢查過，沒有任何版本被就地修改過。因此用 HEAD 的內容建立 manifest 是可信的起點。

## 3. 完整性防護設計

- 檔案：`src/content/trials/assessment-manifest.json`（格式 `logic-island.trials-assessment-manifest/1`，約 190 KB），只含摘要，不含題目文字或答案。
- 每個版本一筆紀錄：
  - `hashVersion` 與 `contentHash`：照抄現有身分，不重新計算、不遷移；
  - `fingerprint`：所有部分的 SHA-256；
  - `parts`：七個部分各自 SHA-256 的前 16 位，用來指出是哪個部分變了。
- 正規化：JSON 物件鍵排序，所以只改欄位順序不算內容變更。
- 程式：`src/lib/trials/integrity.ts` 是純函式，用 `node:crypto`，網站不能 import。`pnpm trials:integrity` 是 CLI：
  - `pnpm trials:integrity [--json report.json] [--base 舊manifest.json]`：唯讀驗證，不一致時 exit 1，用法錯誤 exit 2；
  - `pnpm trials:integrity --append`：dry run，列出 manifest 還沒記錄的版本；
  - `pnpm trials:integrity --append --confirm N`：只新增這些版本，從不改寫已有紀錄。
- 報告只列出版本、部分與雜湊，例如 `moex-114-pukao-3448-q01@2: changed answer; content hash … → … — edit through a new revision, never in place`。
- 合法的修訂流程：
  1. 用 importer 加 `change` 說明，產生新版本（第 2 版雜湊）；
  2. 新版本回到 `in-review`，需要新的人工審核；
  3. 審閱 diff 後執行 `--append --confirm 1`。
  - 舊版本的 manifest 紀錄與 published hash 保留不動。

驗收（`tests/trials-integrity-guard.test.ts`，14 項）：

| 情境 | 結果 |
|---|---|
| 直接改已發布舊題的解析（舊版雜湊不變） | 失敗，`explanation` |
| 直接改選項解析 | 失敗，`optionExplanations` |
| 改正解、題幹、選項、配分 | 失敗，並列出新舊內容雜湊 |
| 改顯示權限、把舊版本改標成第 2 版、刪除版本 | 失敗，`config`／`missing` |
| 只改標籤、參考文件、易變資訊、難度 | 通過（營運中繼資料） |
| 合法新版本 | 新的第 2 版雜湊、`in-review`、manifest 只少這一筆，`--append` 只新增這一筆 |
| 原已發布版本 | 舊版雜湊與 manifest 紀錄不變 |
| 57 筆 published hash | 和 baseline 逐字相同（含檔案位元組） |
| 改寫或刪除 manifest 舊紀錄 | `appendOnlyFailures` 失敗 |

## 4. 生命週期狀態機

```
in-review ──人工核准（綁定題號＋版本＋雜湊）──▶ approved ──發布（publish.ts）──▶ published
    ▲                                                              │
    │  新版本（任何內容變更）                               撤回（revoke.ts，append-only）
    │                                                              ▼
    └────────────── 新版本 ◀──────────────────────────────── revoked
                                            │
                     人工重新核准（日期 ≥ 撤回日）＋ publish.ts --republish
                                            ▼
                                        published
```

T.3F 之前的盤點結果：
- 只有 `in-review → approved → published`，沒有撤回；
- `ReviewState` 有 `retired` 狀態值，但沒有任何流程會產生它；
- 題目層級有 `retired` 欄位（內容退役），但它不屬於帳本，也不會記錄是誰、在何時撤下。

本輪新增 `revoked` 狀態：曾經發布、經帳本撤回。它不能出題，直到明確重新發布。

## 5. 撤回行為

帳本格式不變（`logic-island.trials-ledger/1`），新增一個選用陣列 `revocations`。舊帳本沒有這個陣列時視為空；真實 ledger.json 沒有改動。

- **撤回紀錄**：`{exam, questionId, revision, hash, by, at, reason}`，只能附加；被撤回的發布紀錄留在帳本裡。
- **事件順序**：每個版本的事件必須交替出現：發布（T.2C 之前記錄的 hash，或一筆 publication）、撤回、再發布……。發布次數多於撤回次數時，該版本才算上線。
  - 判斷 T.2C 之前發布的題目：published hash 有紀錄，且沒有自己的第一筆 publication。透過發布流程上架的題目也會記錄 hash，所以不能只看 hash 有沒有紀錄（演練中發現並修正了這個重複計算的錯誤）。
- **`planRevocation`／`revoke.ts`**：
  - 目標必須是目前版本，而且正在上線；
  - 執行者必須有 `publish` 角色；
  - 必須寫原因，並用 `--confirm N` 確認；
  - 可用 `--exam` 限定認證；
  - 全部成功或全部不寫入；published-hashes.json 不變。
- **重新發布**：
  - 必須加 `--republish`；
  - 需要日期在撤回日當天或之後的人工核准，撤回前的核准不算數；
  - 發布紀錄會標 `republishes: true`。
- **`checkLedger` 會擋的情況**：
  - 沒有撤回就發布兩次；
  - 撤回次數多於發布次數；
  - 撤回日期早於發布日期；
  - 重新發布沒有標記；
  - 重新發布沒有撤回之後的核准；
  - 原因空白；
  - 認證錯置；
  - 角色不符。
- **Preflight `ledger` 檢查**：
  - 帳本已撤回、但題庫狀態仍是 `published`，就失敗（撤回確實生效）；
  - 狀態是 `revoked`、但帳本沒有撤回紀錄，也失敗。
- **已知限制**：53 題 T.2C 之前發布的題目，全部是 APCS、MOEX、Bank IT 固定卷的題目。撤回其中一題時：
  - 撤回紀錄本身有效；
  - 但題庫驗證會因為固定卷含有不能出題的題目而拒絕重建，什麼都不寫入（fail closed）；
  - 要撤回這些題目，必須先修訂固定卷，列為 T.3G 工作；
  - CCAR-F 與 iPAS 是從題池動態組卷，撤回立即生效。

## 6. 發布演練（隔離 fixture）

`tests/helpers/publication-harness.ts`：
- 全部在記憶體中進行：深拷貝真實帳本，加入一位 `synthetic-reviewer`（名稱為 `SYNTHETIC test reviewer (not a person)`）。
- 每筆決定的 note 都標 `SYNTHETIC: test fixture record, not a human approval`。
- 用與 review／publish CLI 相同的 `planImport` 在記憶體中重建題庫，從不寫檔。

`tests/trials-publication-lifecycle.test.ts`（20 項）走過下列步驟：
1. 用 SYNTHETIC 核准 150 題 CCAR-F，每份決定檔 25 題，共 6 份；
2. 發布；
3. 組卷，得到兩份考卷（120 分鐘正式模式、150 分鐘練習模式），題池 150 題，每題都固定到已發布的版本與雜湊；
4. 撤回 `ccarf-f-115`：題池變成 149 題，300 個 seed 都抽不到它，它也不能出題，並重新成為外洩掃描的關鍵字；
5. 被撤回前的 session：`unrestorable` 會回報該題，不會改用另一份考卷；它的原版本、原雜湊與 manifest 紀錄仍可完整讀回；
6. 重新發布：沒加 `--republish`、只有撤回前的核准、或日期早於撤回日，都會被拒絕。撤回後重新核准再加 `--republish` 才成功，題池回到 150 題。

必測的 10 個情境，以及演練中對應的處理：

| # | 情境 | 結果 |
|---|---|---|
| 1 | 審稿中的題目不能發布 | 拒絕：not approved |
| 2 | 核准綁定版本與雜湊 | 拿其他雜湊或其他版本做決定：stale，拒絕 |
| 3 | 核准不會轉移到修訂後的內容 | 第 2 版回到 `in-review`，第 1 版的核准仍綁在第 1 版；第 2 版不能發布 |
| 4 | 已發布的題目可以撤回 | 附加一筆撤回紀錄，150 筆發布紀錄都保留，hash 不變 |
| 5 | 撤回的題目不再進入新考卷 | 立即生效，見上方第 4 步 |
| 6 | 歷史 session 仍可解讀 | 見上方第 5 步 |
| 7 | 重新發布需要明確授權 | 見上方第 6 步 |
| 8 | 重複事件 | 重複發布或撤回都會拒絕；帳本內重複的紀錄由 checkLedger 標出；同一份決定檔重複決定同一題會拒絕 |
| 9 | 不合法的轉換 | 撤回審稿中的題目、撤回日早於發布日、沒寫原因、沒有角色、重新發布從未撤回的題目、偽造的重新發布紀錄：都會被拒絕或標出 |
| 10 | 跨認證 | 決定檔、發布、撤回、帳本紀錄任何一處認證錯置，都會被拒絕 |

隔離證明：
- 演練前後比對真實 ledger.json、published-hashes.json、assessment-manifest.json 與每個 generated 檔的 SHA-256，全部相同。
- 含有 SYNTHETIC 審核者或紀錄的帳本會讓 preflight `ledger` 檢查失敗，所以演練資料不可能合併回真實帳本。
- 演練中 iPAS 的題池、APCS／MOEX／Bank IT 的題目狀態，以及非 CCAR-F 的 hash 都不變。

## 7. 人工審核準備

`scripts/trials/review-packet.ts` 改進：
- 決定範本的 `by`（審核者）與 `at`（日期）刻意留空，不預填 `owner`。空白的範本會被 `planDecisions` 拒絕。
- 每題新增「風險標記」列：第一優先、僅依 Exam Guide、版本敏感，以及佇列標記。
- 每題末尾新增「人工審核」空白表：決定、審核者、審核日期、原因。說明文字寫明 AI 預審、AI QA 與版本敏感度都只是參考，不得填入人工決定。

CCAR-F 優先 1 的 31 題已輸出成兩份審核包，前 13 題依指定順序排列：
1. B35、B42、B46、B48、C72、D97、D100；
2. 僅依 Exam Guide 的 F121、F124、G133、G135、G143、G148；
3. 其餘依風險排序。

| 檔案（私人 scratch，不提交） | 題數 |
|---|---:|
| `…/scratchpad/t3f/review-packets/ccarf-ccarf-2026-07.foundations-p1-risk-01-25.md`（＋ `.decisions.json`） | 25 |
| `…/scratchpad/t3f/review-packets/ccarf-ccarf-2026-07.foundations-p1-risk-26-6.md`（＋ `.decisions.json`） | 6 |

每題都有：
- 題號、版本、內容雜湊與雜湊版本（含版本歷史）；
- 領域、考綱（Task Statement）、題幹、選項、正解、解析與選項解析；
- 官方參考文件與查證日期、AI 技術預審（標明「AI，不是人工審核」）、風險標記；
- 空白的人工決定、審核者、日期。

31 筆決定全部是 `verdict: null`、`checks: []`、`note: ''`，審核者與日期留空。沒有任何題目被核准。審核包含有未公開答案，不在 repo 中。

## 8. 版本敏感題流程

把**技術正確性**與**官方文件可用性**分開記錄：

- `docs/exam-system/data/ccarf-volatility.json`（格式 `logic-island.trials-volatility-register/1`）：76 題，每題記錄題號、版本、內容雜湊、`technical`（狀態、日期、查證者）與 `sources`（可用性、日期）。
  - `technical` 目前全部是 `ai-checked`，查證者是 `ai`，日期沿用每題的 `volatility.checkedAt`（A–E 是 2026-11-05，F–G 是 2026-11-09）。沒有任何題目標為 `human-verified`。
  - `sources` 是 2026-11-09 用 `--check-sources` 實測的結果：48 個官方網址全部可連線。
- `pnpm trials:volatility --exam ccarf [--today D] [--due-soon 30] [--json f] [--check-sources] [--list]` 是唯讀工具。每題列出：題號、版本、參考的產品（由網址判定：Claude Code、Claude API、Claude Agent SDK、MCP、Anthropic guidance、Exam Guide）、官方來源、上次查證日、複查日、易變原因、技術查證狀態、文件可用性與標記。
- 標記：`overdue`、`due-soon`、`missing-source`、`exam-guide-only`、`missing-review-date`、`source-unavailable`（只有 `--check-sources` 時才會出現）、`revision-changed`、`unregistered`。
- 以下情況會讓技術狀態自動變成 `pending-verification`：
  - 版本或雜湊和登記時不同；
  - 已過複查日；
  - 沒有登記。

  網址可連線不會讓狀態變成「已驗證」。工具不會修改答案、版本或登記檔。
- 會讓工具 exit 1、讓 preflight 檢查失敗的情況：
  - 有題目沒登記；
  - 登記查證的是其他內容；
  - 登記檔有過時條目；
  - 缺少複查日；
  - 已發布的題目過了複查日。

  即將到期、僅依 Exam Guide、審稿中但已逾期的題目，只報告、不判定失敗。
- 2026-11-09 的結果：76 題中：
  - 技術待查證 0；逾期 0；30 天內到期 0；缺來源 0；缺複查日 0；
  - 最近的複查日是 2027-02-03（A 批）；
  - 產品分布：Claude Code 45、Claude API 22、Claude Agent SDK 12、Anthropic guidance 5、MCP 4；76 題全部另外引用 Exam Guide。
- iPAS 的 13 題版本敏感題沒有任何參考文件（`missing-source` 13），也還沒有登記檔。目前只報告，列為 T.3G 工作。

## 9. CI 變更

`.github/workflows/trials-ci.yml` 的所有步驟都是唯讀：不會修復、核准或發布，失敗就 exit 非 0。

| 步驟 | 內容 |
|---|---|
| checkout | `fetch-depth: 0`，讓 CI 能讀到 base commit 的 manifest |
| Ledger … (tests) | 新增 integrity-guard、publication-lifecycle、volatility 三個測試檔 |
| Assessment integrity guard | `pnpm trials:integrity --json trials-integrity.json`。base commit 有 manifest 時加 `--base`，證明只新增、未改寫 |
| Version-sensitive questions (CCAR-F) | `pnpm trials:volatility --exam ccarf --json trials-volatility-ccarf.json`（離線，不連網） |
| Release preflight (data／build／probe) | 改為 `--json` 輸出到檔案，失敗時印出內容 |
| Quality gate | `trials:quality` 也會比對該認證的 manifest（CCAR-F 159 個版本：舊版 117、第 2 版 42） |
| Artifacts | `trials-quality`：quality、integrity、volatility、preflight data 的 JSON；`trials-preflight`：build 與 probe 的 JSON |

報告只含題號、雜湊、計數與日期，不含未發布題目的題幹全文、答案或解析。Release preflight 從 10 項資料檢查增為 13 項：
- 新增 `assessment-integrity`、`cross-exam`、`volatility-register`；
- 強化 `ledger`：撤回生效檢查、SYNTHETIC 檢查，以及外洩掃描的關鍵字。

缺少 manifest 或登記檔時，相關檢查直接失敗（fail closed）。

**GitHub CI 尚未執行**，因為沒有 push。上述 workflow 只在本機用 YAML parser 驗證過結構；以下各項 gate 都在本機逐一執行過。

## 10. 跨認證回歸

| 認證 | 驗證內容 | 結果 |
|---|---|---|
| CCAR-F | 150 題題庫、60 題動態組卷、120 分鐘正式模式／150 分鐘練習模式、單選與複選、session 保存、完全正確才計分、結果頁、錯題檢討 | Fixture build E2E 12／12（桌面 6、iPhone 13 6）；10,000 seeds 0 違規 |
| iPAS | 200 題、L11／L12、75 分鐘正式模式／120 分鐘練習模式、只從已發布題組卷、考綱分析、結果頁 | Fixture build E2E 12／12（桌面 6、iPhone 13 6）；1,000 seeds 0 違規 |
| 已發布（APCS、MOEX、Bank IT） | 固定卷、真實 build 中的路由 | 真實 build E2E 10 通過、2 依設計略過（flag off 的情境）；桌面與 iPhone 13 |

`cross-exam` preflight 檢查確認：
- 抽題式認證（CCAR-F、iPAS）的題目只屬於自己的認證；
- 每個 blueprint 的題池、每份考卷、每筆帳本紀錄都沒有混到其他認證；
- 固定卷的原創練習題可以同時指向多個認證（核心＋相關），但它們沒有帳本紀錄，也不會進入抽題考卷。

## 11. 安全驗證

以下全部是**本機驗證**，在隔離副本中執行：Theme Session 的 5 個檔案取 HEAD 版本，不含 `.claude/`，node_modules 用複製；用 IntelliJ 內附的 JDK 25 執行 Java 範例。

| 檢查 | 結果 |
|---|---|
| TypeScript（`tsc --noEmit`） | 0 錯誤 |
| ESLint | 0 錯誤 |
| Trials tests | 26 個檔案、357／357（本輪新增 3 個測試檔：integrity-guard、publication-lifecycle、volatility） |
| Full Vitest | 69 個檔案、1940／1940，0 略過（292 秒），未加入 cross-exam 負面測試前；加入後在 HEAD 快照重跑，結果見 commit 報告 |
| Production build（`LOGIC_ISLAND_TRIALS=1 LOGIC_ISLAND_REGIONAL_WORLD=1`） | 成功 |
| Release preflight（`--build .next --probe`） | 16／16 通過（0 略過、0 警告） |
| Client bundle leak scan | 834 個 client 與預先產生的檔案、708 個關鍵字、0 命中 |
| Runtime route probe | 111 個預先產生的路由（/trials 下 11 個）；實測 38 個路由，CCAR-F 與 iPAS 全部 404 |
| Assessment integrity guard | 429 個版本全部一致（`--base` 對自身：0 改寫） |
| Volatility check | CCAR-F 76 題：0 失敗、0 待查證；48 個官方網址可連線（2026-11-09） |
| Quality gate CCAR-F（10,000 seeds，strict） | 通過：10,000／10,000 成功、全部不同、0 違規、0 從未抽到、0 每卷都出現；p50 0.176、p95 0.621、p99 0.942、最大 2.573 毫秒；manifest 159 個版本一致 |
| Quality gate iPAS（1,000 seeds） | 通過：s1 p99 0.407、s2 p99 0.556 毫秒；manifest 213 個版本一致 |
| 真實 build E2E（`e2e/trials.spec.ts`） | 10 通過、2 依設計略過 |
| Fixture build E2E（iPAS、CCAR-F 視為已發布） | 24／24 通過（桌面、iPhone 13）；fixture 副本在測試後已刪除，3123、3124 port 已釋放 |
| 各 commit 快照 | commit 1：tsc 0、trials 325／325；commit 2：tsc 0、345／345；commit 3：tsc 0、356／356；每個快照的 preflight、integrity、volatility、quality 都通過 |

Phase 9 要求的安全與完整性測試：

| 測試 | 位置 |
|---|---|
| 舊版解析遭竄改 | `tests/trials-integrity-guard.test.ts` |
| 選項解析遭竄改 | `tests/trials-integrity-guard.test.ts` |
| 雜湊版本相容性 | `tests/trials-integrity-guard.test.ts`（manifest 與每個版本的身分一致）、`tests/trials-hash-governance.test.ts` |
| 不合法的審核轉換 | `tests/trials-publication-lifecycle.test.ts` 情境 9 |
| 撤回的題目不進入組卷 | 同上，情境 5 |
| 跨認證核准被拒絕 | 同上，情境 10；`tests/trials-release-preflight.test.ts`（cross-exam） |
| 重複事件處理 | 同上，情境 8 |
| 歷史 session 相容性 | 同上，情境 6；`tests/trials-hash-governance.test.ts` |
| Fixture 隔離 | 同上（「the drill stays isolated」「after the drill」） |
| Client bundle 外洩 | `tests/trials-exposure.test.ts`（網站不能 import integrity、volatility、quality、manifest、登記檔）；真實 build 的 leak scan |

測試期待值的變更：
- `tests/trials-release-preflight.test.ts`：資料檢查清單加入三項新檢查。這是新增檢查，沒有放寬原有規則。
- `tests/trials-review-workflow.test.ts`：決定範本改為空白審核者後，測試要自行填入 `owner`。這是更嚴格的行為。
- 沒有任何既有的安全斷言被移除或放寬。

## 12. 剩餘風險

- **人工審核仍未開始**：31 題優先 1（其中 6 題僅依 Exam Guide）的審核包已準備好，但沒有任何人工決定。
- **認證條款合規尚未確認**：發布任何 CCAR-F 題目之前，需要先決定合規問題。
- **GitHub CI 從未執行**：新的 integrity、volatility 與 artifact 步驟只在本機驗證過；`fetch-depth: 0` 與 `--base` 的比對要到第一次 push 後才會實際執行。
- **manifest 防偶發，不防惡意**：它防止意外或未經審閱的直接編輯，但無法阻止有寫入權限的人在同一個 commit 同時改內容與 manifest（第一次建立時也一樣）。仍需靠 code review，以及 CI 對 base commit 的「只能新增」比對。
- **既有已發布題不能直接撤回**：53 題都在固定卷中，撤回前必須先修訂固定卷（fail closed）。
- **同日事件的順序**：撤回與重新核准的先後只比較日期。同一天先重新核准、再撤回的情況，無法分辨先後。重新發布還要求明確的 `--republish` 與 `--confirm`，以降低風險。
- **iPAS 版本敏感題**：13 題沒有參考文件，也沒有登記檔。
- **技術查證只有 AI**：76 題全部只有 AI 查證（`ai-checked`），沒有人工技術查證。
- **抽題頻率不均**：仍是 12.8%–64.3%（A19 最低）。
- **未測環境**：真機、真實螢幕閱讀器沒有測過。

## 13. T.3G 建議

1. 開始人工審核：依審核包順序，從 B35 與僅依 Exam Guide 的 6 題開始。決定只能由本人填寫，並用 `review.ts apply --confirm` 寫入。
2. 確認合規之後，挑少量題目（例如 1 個 task statement）做一次真實的小規模發布，並同時演練撤回。
3. Push 一次，讓 GitHub CI 實際跑新的 gates。檢查 artifacts 與 `--base` 比對，並在 branch protection 中把 trials-ci 設為必過。
4. 設計固定卷的版本修訂流程，讓 53 題既有已發布題也能撤回。
5. 為 iPAS 的 13 題版本敏感題補上官方參考文件與登記檔；逐步把 CCAR-F 的 `ai-checked` 換成人工技術查證（`human-verified`）。
6. 設定定期執行 `pnpm trials:volatility --check-sources`（本機或排程）。複查日前 30 天先處理即將到期的題目。
7. 舊版雜湊題目在下次修訂時，透過新版本改用第 2 版雜湊。永遠不要批次重新計算。
