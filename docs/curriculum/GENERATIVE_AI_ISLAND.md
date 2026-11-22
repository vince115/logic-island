# 生成式 AI 島（Generative AI Island）

> 2026-11-23 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `llmFromBlueprint` 讀入。

教學方式是 LLM-0 的 `llm-explorer` 能力（[LLM0_LANGUAGE_MODEL_CAPABILITY](LLM0_LANGUAGE_MODEL_CAPABILITY.md)），藍圖練習為 code-python 的課再加上 `python-code`（Python 標準庫、固定 seed 的範例與有測資的練習，[AIF0_PYTHON_CAPABILITY](AIF0_PYTHON_CAPABILITY.md)）。探索器的資料一律是示意資料，不呼叫任何真實模型。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 探索器與程式 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| GEN01 | 生成模型概觀<br>`generative-models-overview` | 入門 | 45 分 | AIF01 | 3 個取樣探索器（玩具旋律、地形圖塊、圖說的最後一個字） | 6 段、3 個練習（一段樣本與其中兩步的機率、temperature 與 top-k、不同 seed 與 greedy）、8 題 | **完整 v1.0.0** |
| GEN02 | 自回歸生成模型<br>`autoregressive-generative-models` | 入門 | 55 分 | GEN01、LLM01 | 3 個取樣探索器＋ 6 個 Python 範例 | 6 段、4 個 Python 練習（字元取樣器、序列的 log 機率、temperature／top-k／top-p、偵測重複的 greedy）與 2 個探索練習、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 生成模型與自回歸生成 | GEN01–GEN02 |

## 後續批次

GEN03（自編碼器與 VAE）需要深度學習島的 DL01、GEN04（GAN）需要 DL03，深度學習島又需要機器學習島（教學方式待決定）；GEN05（擴散模型）需要尚未建立的 diffusion-steps 能力。本島暫停在 GEN02。

課程狀態與 3D 地景分離：生成式 AI 島的 `mapState` 仍是 `'planned'`。
