# 教材撰寫指南（Content Authoring Guide）

> Phase E.1。把一堂「規劃中」的課完成為「完整教材」的步驟與標準。欄位規則見 [LESSON_CONTENT_SCHEMA](LESSON_CONTENT_SCHEMA.md)，課程順序見 [PHASE_E_CURRICULUM](PHASE_E_CURRICULUM.md)。範例：`src/content/curriculum/content/F01.ts`～`F05.ts`。

## 1. 流程

1. 確認這堂課在 `lessons.ts` 的大綱（目標、概念、先修、視覺化類型）仍然合理；要調整就一起改，並重新產生課綱規格的課程表。
2. 若課程的視覺化類型還是 planned：先實作它（`src/components/curriculum/visualizations.tsx` 與 schema 的設定型別），在 `registry.ts` 改為 implemented。不要用靜態圖片或假的按鈕代替。
3. 新增 `content/<lessonId>.ts`，匯出 `LessonContent`，在 `index.ts` 的 `contents` 加入。
4. 在 `lessons.ts` 把這堂課改為 `status: 'complete'`、`version: '1.0.0'`。
5. 執行 `tests/curriculum.test.ts`（規則）與 `tests/curriculum-code.test.ts`（每段程式實際執行），全部通過；有 JDK 的環境要確認 Java 也通過。
6. 在瀏覽器檢查桌機與手機版面（`/curriculum/<slug>`），並更新課綱規格 §5。

## 2. 內容標準

- **用繁體中文寫給第一次學的人**：先說為什麼需要，再說怎麼做，最後說常見錯誤。專業術語第一次出現時附英文（例如「指定（assignment）」）。
- **每段都要有教學價值**：避免「本節介紹…」「非常重要」這類空話；用具體例子、數字與反例說明。
- **把常見錯誤寫出來**：每堂至少一個 `warning` callout，說明初學者實際會犯的錯（例如 F04 的 C++ 連續比較、F05 的 `=` 與 `==`）。
- **三語差異是內容**：語言行為不同時（整數除法、型別、讀取方式）要明確比較，不要只寫其中一種。
- **只寫已確認的事實**：語言行為以實際執行或語言規格為準；涉及 APCS 時只寫能力類型，不寫題號、級分或保證。

## 3. 程式碼

- 三語都要寫，而且**用各語言自然的寫法**，不逐行翻譯：C++ 用 `std::` 與 `"\n"`（不使用 `using namespace std` 與 `endl`），Python 用 `map(int, input().split())`、f-string、`divmod` 等慣用法，Java 一律 `public class Main`、用 `Scanner` 或 `String.format`。
- C++ 以 C++17 編譯，需通過 `-Wall -Werror`；Python 3；Java 17 以上。
- 程式要短：範例以 5～20 行為原則，只示範本課的觀念。
- 在 TypeScript 中用 ``String.raw`…` ``（檔案中的 `const code = String.raw`）撰寫程式碼，`"\n"` 才會保持原樣；不要在程式碼中使用 `${`。
- 每個範例都寫 `output`（以及讀輸入時的 `stdin`）；三語輸出不同時（例如負數除法）寫 `outputByLanguage`，並在正文說明原因。
- 輸出盡量使用 ASCII 文字，避免各平台編碼差異；浮點數一律指定小數位數。

## 4. 觀念測驗

- 至少 3 題（建議 4 題），每題考一個本課的觀念，最好是學生真的會答錯的地方（程式追蹤、邊界、語言差異）。
- 選項要像真的答案；錯誤選項來自常見誤解，而不是明顯荒謬的句子。
- 解析要說明「為什麼對」以及「錯的選項錯在哪」，必要時給驗算過程。
- 有程式片段時放在 `code`，並註明語言。

## 5. 程式練習

- 題目要寫清楚：敘述、輸入格式、輸出格式、限制（範圍）、至少一組範例與說明。
- 測資至少包含：一般（normal）、邊界（edge：最小值、最大值、分界點、可能溢位的值）、以及錯誤輸入（error）——題目保證輸入合法時，改寫 `errorPolicy` 說明原因。
- 參考解答三語都要能通過全部測資（`tests/curriculum-code.test.ts` 會執行）。
- 在本課之前還沒教到的語法（例如 F01、F02 還沒教輸入）用 `starter` 提供，讓學習者只寫本課的部分。
- E.1 沒有線上評測：`judge` 一律是 `'none'`，頁面會說明「請在自己的電腦上執行並比對測資」。**不得**新增會在伺服器或瀏覽器執行使用者程式碼的功能（`eval`、未隔離的執行器、執行程式碼的 API），除非另有經過審查的安全設計並獲批准。

## 6. 視覺化

- 只在能幫助理解時使用；設定放在內容檔，不寫在元件裡。
- `variable-state`：程式選本課的核心片段（可與範例不同語言），每一步寫「這一行做了什麼」，`vars` 是執行完這一行之後的值，字串值加引號。
- `conditional-branch`：分支依程式中的順序排列，`result` 要和參考解答的輸出一致（`tests/curriculum.test.ts` 會比對 F05 的邊界值）。

## 7. 完成前檢查清單

- [ ] 至少 3 個學習目標，內容逐一涵蓋
- [ ] 至少 3 個段落，含常見錯誤的提醒
- [ ] 範例三語齊全、輸出已驗證（C++、Python 已執行；Java 已執行或標示 Not Executed）
- [ ] 至少 3 題測驗，每題有解析
- [ ] 至少 1 題練習，含一般、邊界與錯誤（或 `errorPolicy`）測資，三語參考解答通過
- [ ] 視覺化已實作且設定正確（或課程不使用視覺化）
- [ ] `lessons.ts` 狀態為 complete、版本 1.0.0；課綱規格已更新
- [ ] 桌機與手機（360／390 px）沒有水平溢出、按鈕有名稱
