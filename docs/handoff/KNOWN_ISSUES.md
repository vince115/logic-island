# 已知問題、技術債與交接風險

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## P0：先阻止錯誤接手或不可重現交付

| ID | 問題／實際證據 | 影響 | 建議（本輪不修） |
|---|---|---|---|
| P0-01 | `src/components/islands/islands.module.css` 不存在，5 個引用；`evidence/actual-build.log` | 最新全站 production build 失敗；舊 .next 可誤導 | 取得下一個功能修復授權後，先確認缺失檔是否有外部副本，再修復原型樣式；不要臨時空白 CSS 當驗收成功 |
| P0-02 | 本次說 C.1 尚未批准，但 `basics-v2.1/` 與 MCP 開啟檔都證明已製作；Phase D 仍未批准 | Claude 可能重做／覆蓋模型，或誤把資產候選當整合授權 | 保留 v2 與 v2.1，請人工確認目前採用候選與 C.1 決策，D 保持凍結；見 IMPLEMENTATION_STATUS。**2026-10-29：C.1 已決議，v2.1 有條件批准為 D 候選；D 仍待批准開始，見 ROADMAP** |

## P1：接下來應優先處理

| ID | 問題／證據 | 影響與建議 |
|---|---|---|
| P1-01 | three 無可解析宣告，3×TS7016；`package.json` 沒列 @types/three，`actual-typecheck.log` | 確認與 three／R3F 相容的型別套件與依賴關係；不要用 any 或關閉 strict 掩蓋 |
| P1-02 | `island-scene.tsx:51` mutation hook-returned scene 觸發 react-hooks/immutability | 正確配置 R3F background 或調整 scene ownership，不把整條 lint 規則關閉；驗證 contextlost 及 unmount |
| P1-03 | 根目錄沒有 .git、HEAD、remote；也沒有 .gitattributes／LFS | 來源歷史與回復能力缺失，無法提交 diff；先保全／人工確認真正遠端與 Git 初始化策略。禁止自動 init 或 add 全部 |
| P1-04 | 81 個外部資產檔僅在 Codex 私有絕對路徑，模型／viewer 未在專案 public | 換機／換 agent 可能讀不到；先核對 inventory hashes，經批准複製候選及規格，再設 GLB 與源模型分流管理；本輪不搬 |
| P1-05 | 原始嚴格共面檢查為 false，v2.1 仍有 113 組配對例外 | Validator 不測 Z-fighting；兩視角樣本不保證所有角度。依 Coplanar_Exceptions...逐區核對，不一律刪除合理端蓋 |
| P1-06 | Blender addon 1.8／protocol 14，server 預期 15；MCP status 仍可回應 | Claude 的 MCP 設定／連線不會自動繼承；先 read-only 檢查，不擅自升級或重啟。get_format_items callback 是版本實作，不是穩定跨版 API |
| P1-07 | Java 無 JDK；Web E2E 未跑；原型沒有 islands 測試；真實手機未測 | 目前單元成功不保證 hydration／WebGL／觸控。build 修復後再實測，工具／安裝需按新授權執行 |
| P1-08 | 既有 R3F 原型是三座 local geometry，正式資產只有基礎島候選 | 原型≠Phase D。換 GLB 必須更新 registry union、尺度 bounds、光照、loading／fallback、node ID map、資源清理，不能直接替換路徑即完成 |
| P1-09 | 原型基礎島 catalogEntry=/learn；Blender Workshop metadata route=/learn | 不存在「基礎程式島專屬課程」路由。人工確認 lighthouse／learn／entry 的產品行為，不能自創教材或錯導所有點擊 |
| P1-10 | .gitignore 不排除 .env*、沒有二進位策略 | 當前無秘密 env 檔，但未來建立 Git 前要審查 ignore／LFS／來源歸屬；不要把1.2G node_modules、298M .next 或整個 Codex folder 放入版控 |

## P2：可延後但需有記錄

- `src/lib/engine.ts` 的共用 Input、slug 分支、Step codeKey 與 `courses.ts` marker 關聯偏鬆；新增教材需同步變更多處。引擎結果測試不等於 code highlight 正確性測試。
- Source TSX 多數壓成極長行，增加跨 AI 修改衝突；格式整理應另案，不能與教材／3D 整合混成無法審查的大變更。
- README 的最後 Phase 2 建議落後目前檔案；本輪保留原文、交接文件註明時效，日後經授權再同步。
- v2.1 有 unused UV info，屬非阻擋提示，可後續清理；不應為此重做全模型。
- 正式模型根節點契約有意義，但輔助 Terrain.001／Vegetation.001 等因來源場景保留帶 suffix；程式以 role／interaction_id 與穩定主節點操作，不依賴自動 suffix。
- 草地／岩層／屋頂仍有人工美術例外，未做 LOD1／LOD2、AO atlas、鏡頭遠近全角度驗收。不要在人工已接受風格後無限精修。
- 手機全島縮圖不能逐字讀 START 或 </>；應由未來可存取 UI／縮放補足。圖片不是已完成教材 UI 的證明。
- 單島 21／24 主 pass draw calls 不含正式多島、陰影與後處理成本；不能直接乘島數宣稱可跑。原型自身也沒有 profile 數據。

## 跨 Agent 交接控制

1. 每輪先核對根目錄、檔案 hashes、Phase 批准與來源差異；本案無 Git，更應建立經人工認可的 checkpoint。
2. Codex 與 Claude 不同時改同一工作樹／同一 Blender session。沒有提交邊界前，約定單一寫入者。
3. 不因舊訊息說「可執行」就自動部署、進 D、重跑生成腳本或更新 Blender addon；以當前任務授權為準。
4. 先做只讀核對與最小可重現失敗，再提出局部修改；避免重新產生所有教材、lockfile 或島嶼。
5. 資產轉移先 copy、比較 SHA-256 與驗證報告，保留原檔；不要 move／delete 私有來源場景。
6. 秘密值不進交接文件；只列實際使用變數名稱。這輪無產品必填 env，不能因此要求輸出全環境。
