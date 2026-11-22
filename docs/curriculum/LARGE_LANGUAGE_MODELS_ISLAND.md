# 大型語言模型島（Large Language Models Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `llmFromBlueprint` 讀入。

教學方式是 LLM-0 的 `llm-explorer` 能力（[LLM0_LANGUAGE_MODEL_CAPABILITY](LLM0_LANGUAGE_MODEL_CAPABILITY.md)）：斷詞、取樣與 embedding 三種探索器，資料都是標示為「示意資料」的小型資料，不呼叫任何真實模型；練習的答案由探索器的資料算出並逐一驗證，常見的錯誤答案也必須被拒絕。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 探索器 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| LLM01 | 大型語言模型概觀<br>`llm-overview` | 入門 | 45 分 | AIF01 | 3 個取樣探索器（早餐句子、逐 token 生成的故事、會產生幻覺的首都問題） | 6 段、6 個練習（temperature 下的機率、top-k 與 top-p 保留哪些 token、greedy 的接續、固定 seed 的取樣、幻覺與 top-p）、8 題 | **完整 v1.0.0** |
| LLM02 | Tokenization 斷詞<br>`tokenization` | 入門 | 50 分 | LLM01 | 4 個斷詞探索器（英文語料訓練的合併規則、同一張表斷中文、中文語料、程式碼） | 6 段、8 個練習（token 與開頭的空白、中文字的位元組、下一條訓練出的規則、token 數、token ID 與特殊 token、中英文與程式碼的 token 數、費用）、8 題 | **完整 v1.0.0** |
| LLM03 | 嵌入向量<br>`embeddings` | 中級 | 50 分 | LLM02 | 3 個 embedding 探索器（token embedding 表、句子搜尋、內積與餘弦的差異） | 6 段、6 個練習（餘弦相似度、最近的 token、前三名、句子搜尋、讀投影座標、長向量的內積與餘弦）、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 語言模型如何讀寫文字 | LLM01–LLM03 |

## 後續批次

LLM04（用 Transformer 做語言模型）需要深度學習島的 DL18，深度學習島又需要機器學習島（教學方式待決定），所以本島暫停在 LLM03。生成式 AI 島的 GEN01 使用同一個能力，另成一批。

課程狀態與 3D 地景分離：大型語言模型島的 `mapState` 仍是 `'planned'`。
