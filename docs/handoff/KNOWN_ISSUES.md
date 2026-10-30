# 已知問題、技術債與交接風險

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## P0：先阻止錯誤接手或不可重現交付

| ID | 問題／實際證據 | 影響 | 建議（本輪不修） |
|---|---|---|---|
| P0-01 | `src/components/islands/islands.module.css` 不存在，5 個引用；`evidence/actual-build.log` | 最新全站 production build 失敗；舊 .next 可誤導 | 取得下一個功能修復授權後，先確認缺失檔是否有外部副本，再修復原型樣式；不要臨時空白 CSS 當驗收成功。**2026-10-29：已解除，CSS 存在且 build 通過** |
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
| P1-07 | Java 無 JDK；Web E2E 未跑；原型沒有 islands 測試；真實手機未測 | 目前單元成功不保證 hydration／WebGL／觸控。build 修復後再實測，工具／安裝需按新授權執行。**2026-10-29（D.1）：Web E2E 已在隔離副本執行，新增 islands E2E；真機與 Java 仍未驗證，見 P1-11** |
| P1-08 | 既有 R3F 原型是三座 local geometry，正式資產只有基礎島候選 | 原型≠Phase D。換 GLB 必須更新 registry union、尺度 bounds、光照、loading／fallback、node ID map、資源清理，不能直接替換路徑即完成。**2026-10-29（D.1）：基礎程式島已在分支改用 GLB（registry、bounds、fallback、節點名稱對照、clone 不 dispose 共用資源）；光照未調整，屬 D.2** |
| P1-11 | 既有 `e2e/player.spec.ts` 3 個案例失敗：bfs 教材（desktop）「播放」按鈕不在 viewport；「播放中更換輸入」（desktop／mobile）找不到 `操作` 欄位。D.0 基線同樣失敗，與 D.1 無關 | 這套 E2E 先前從未執行過。需另案判斷是測試過時或播放器問題；不在 Phase D 範圍。**2026-10-30：D.2c-1／D.2c-2 不處理，維持獨立追蹤；兩輪全套 E2E 都是同樣 3 項失敗** |
| P1-12 | D.1 手機視窗（390 px）上「工坊 · 學習路線」與「碼頭」標籤互相靠近，碼頭可點範圍小（大多在 START 標記） | 標籤不攔截點擊，但目標小、易誤觸工坊。屬 D.2 鏡頭拉近／標籤避讓評估 |
| P1-14 | drei `Html` 在同一個 Canvas 中第一個掛載的標籤，若之後沒有重新 render，內容會一直是空的（D.2a 開發時發現）。`/islands` 因 onReady 會 setState 而沒有遇到 | D.2a 的預覽也改成 onReady 時 setState。根本原因尚未查明；之後新增 Html 標籤時要確認第一個有內容 |
| P1-15 | camera-controls 3.1.2 的 `fitToBox` 會把鏡頭轉到最近的軸向（`camera-controls.module.js:1627` 附近的 round to closest axis）。`/islands` 共用的 `camera-controller.tsx` 因此實際上接近正側視，不是等距視角 | D.2a 預覽改用獨立的 `hex-camera.tsx`（固定視角方向，用正交 zoom 框選），`/islands` 未修改。是否修正正式鏡頭屬 D.2b 以後 |
| P1-16 | D.2b 試作：0.6 倍的 GLB 工坊（約 1.8×1.9）比一格六角地塊的有效面積大，只好把 pivot 往廣場方向推；GLB 建築細節多、用頂點色調色盤，另外兩島的暫代幾何與程式生成地塊較簡單、較鮮綠，風格不一致；碼頭甲板與地塊頂面同高，離水面約 0.85 | 屬視覺驗收與 D.2b 後續；可考慮六角專用縮放、地塊配色對齊 GLB 調色盤，或改用 Blender 六角組件（方案 B）。**2026-10-29（D.2b 第二階段）：工坊改跨兩格、碼頭改低岸（甲板高出水面約 0.32）、基礎程式島改用 GLB 粉彩配色；但另外兩島仍是鮮綠的六角柱，與基礎程式島風格不一致，粉彩草地在目前光照下偏灰** |
| P1-17 | 尺度原型的 draw call 偏高（19 格 207、37 格 241，含陰影 pass），主要來自逐段道路與逐塊橋樑的獨立 mesh | 合併道路與橋樑為每座島一個 geometry，預估可減少約 100 個；屬尺度定案後的效能工作。**2026-10-29：37 格已改為道路合併 mesh 與 instanced 橋樑零件，241 → 80；19 格參考版與 A2 維持原樣** |
| P1-18 | 37 格原型中，碼頭在 390 px 手機上太小，E2E 掃描找不到可點範圍（已在 `hex-scale.spec.ts` 標註略過） | 若選 37 格，需要擴大熱區、聚焦時拉近鏡頭，或在 DOM 加地點清單（同時解決 P1-13）。**2026-10-29：37 格原型已加透明碰撞代理（最小 1.6）與 HTML 地點入口，E2E 不再略過；正式 `/islands` 尚未採用** |
| P1-19 | 全套 E2E 同時執行時，`islands.spec.ts` 手機版「燈塔與碼頭」偶發失敗；單獨重複 5 次為 70/70 | 3D 點擊位置受負載與鏡頭穩定時間影響；需要更穩定的等待條件，或改用 DOM 入口測試互動。2026-10-29 Scale Refinement 的全套執行中未再出現 |
| P1-20 | headless Chromium 的 requestAnimationFrame 幀率在本機波動很大（同一份未改動的 19 格頁面兩次執行 33 → 12 fps），不能當作效能驗收依據 | 本輪以 draw call 與 GPU 同步的每幀時間作比較；實際幀率要在 D.3 用真機或非 headless 環境量測 |
| P1-21 | D.2c-1 的 37 格原型在連續渲染時（鏡頭轉場、雙指縮放）幀率約為 D.2b 的 65%（桌機）與 74%（手機尺寸）。**D.2c-2（2026-10-30）已處理**：成本拆解顯示主因是每幀重畫陰影貼圖、83 棵樹的三角形與被海面蓋住的深海平面；改用靜態陰影貼圖、樹木 LOD 與深海外框後，SwiftShader 四個場景的 FPS 為 D.2b 的 105～116%，draw call 81 → 43。Apple M6 GPU 上三版都在 60 FPS 上限 | 仍未在真機量測（D.3，見 P1-25）。桌機鏡頭拉近到全景 1.5 倍以上時仍比 D.2b 慢約 3～5 ms，但桌機沒有滾輪縮放；手機各距離都不比 D.2b 差（×3 例外，約多 4 ms）。見 `logs/2026-10-30-d2c2-performance.md`。**D.3-5a（2026-10-30）起 37 格實驗室頁桌機可用滾輪縮放**（最近到最近聚焦 zoom 的 2 倍），上述拉近時的差距在實驗室頁可被觸及；候選頁與 `/islands` 仍沒有滾輪縮放 |
| P1-22 | 開發模式（`next dev`）下，`/islands/hex/scale/*` 的 console 會出現 3 次 React「Attempted to synchronously unmount a root while React was already rendering」。D.2b 的開發模式同樣出現；production build 不會出現（E2E 的 console 檢查通過） | 來自 drei `Html` 在 StrictMode 重複掛載時的卸載時機，不影響功能；若要處理，需另外調查 drei `Html` 的掛載方式 |
| P1-23 | 靜態陰影快取（D.2c-2）目前只適用於靜態場景：陰影貼圖只在「可見投影物件的 id 或世界座標」改變時重畫；只改旋轉、縮放、InstancedMesh 個別矩陣或太陽方向時不會更新 | 目前場景沒有會動的投影物件，E2E 檢查快取陰影與即時陰影逐像素相同。未來加入 NPC、動畫或其他移動物件前，需要陰影更新機制（例如物件移動時主動標記重畫，或動態物件改用每幀更新）；在那之前這類場景使用 `shadows: 'dynamic'` |
| P1-24 | Tree LOD 門檻（裝置像素／世界單位 < 24，D.2c-2 驗收接受）D.3-1 起移到 `hex-scene-presets.ts` 的 `production` preset，已不綁 Explorer。啟用時（DPR 1 桌機全景、手機全景）樹冠放大 3 倍可看出切面較大，原尺寸幾乎看不出 | 下一步是隨 Phase E 移進島嶼 schema 的 `scene` 區塊（渲染預算），讓不同世界可各自設定 |
| P1-25 | 實體手機的 GPU、觸控與 FPS 尚未驗收：D.2c-1／D.2c-2 的效能數字來自 headless Chromium（SwiftShader 與 Apple M6 Metal）與 iPhone 13 模擬，不代表真機 GPU | 保留至 D.3-4（需另行批准）：在真機量測全景、聚焦與雙指縮放的 FPS，並驗收觸控操作。量測規格與門檻草案（待驗收，未通過）見 `logs/2026-10-30-d3-3-preflight.md` §6。**2026-10-30 D.3-4 準備完成**：真機量測工具 `perf/device/`（Mac 上的 proxy，不改應用程式）與驗收表 [DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)；尚未在任何實體裝置執行，**未通過**。**2026-10-30 決定**：D.3-4 分為 D.3-4A 自動化驗收（Automated Acceptance Passed，限已執行項目）與 D.3-4B 真機效能驗收；iOS Safari／Screen Reader Not Verified；標準測試機為 iPhone SE（第 3 代，最低效能基準）、iPhone 16、中階 Android（Chrome）；B 目前 **Not Measured**，不阻擋其他階段，正式切換仍需另行批准 |
| P1-26 | D.3-0 基準：軟體算圖（SwiftShader）下，37 格世界的鏡頭飛行 FPS 低於正式 `/islands`（桌機 38 對 60，手機模擬 57 對 60），首幀晚約 0.6 秒。正式版每幀 258 個 draw call（主畫面＋陰影）但像素便宜，37 格只有 43 個但三角形與填滿像素較多。Apple M6 GPU 上兩者都是 60 FPS | 這是 D.3-3 切換前必須讓產品決定的差距；真機 GPU 上 draw call 成本較重，結果可能不同，需 D.3-4 真機量測（P1-25）。見 `logs/2026-10-30-d3-0-baseline.md` |
| P1-27 | 兩版地圖的 canvas 都設 `touch-action: none`（`islands.module.css` `.canvasWrap canvas`），手機上單指在地圖上滑動可能不會捲動頁面；地圖在手機上佔大半個畫面。另外 camera-controls 連接時也會把 R3F 外層 div（名牌也在裡面）設成 `none`，只改 CSS 無效 | 現況記錄，未在真機確認：D.3-4 驗收表 T-06 記錄實際行為與是否造成困擾。**2026-10-30 決定方案 B**：單指水平旋轉、垂直捲動頁面、雙指縮放、觸控時仰角固定。**D.3-5a 已在 37 格實驗室頁實作**（外層 div 與 canvas 改 `pan-y`，在控制器連接後寫回）：Chromium iPhone 13 模擬中垂直滑動會捲頁、水平滑動只旋轉；**iOS Safari 未驗證，需真機確認**。候選頁與 `/islands` 不變（仍是 `none`），推進候選頁屬 D.3-5c，需另行批准 |
| P1-28 | 鏡頭飛行的第一幀會跳一大段（2026-10-30 D.3-5b 驗證時發現，**既有行為**）：`frameloop="demand"` 下 R3F 的 `delta` 是距離上一個「有畫的」幀的時間，閒置後第一幀的 `delta` 很大，camera-controls 的平滑一次走掉大半。實驗室頁從轉開約 90° 的全景按「返回全景」，第一幀方位就從 −56.3° 跳到 −14.9°；加不加自動旋轉都一樣。候選頁與 `/islands` 的飛行同樣經過 drei `CameraControls`，第一幀也會大步（距離與 zoom 同理） | 與 D.3-5b 無關，本輪不改（會改變候選頁與正式頁的飛行）。可能做法：飛行開始時讓第一幀的時間差以一幀計（例如自行呼叫 `controls.update` 並限制 delta），需另行批准並以飛行 FPS 與畫面比對驗收。證據：`logs/2026-10-30-d3-5b-auto-orbit.md` §3 |
| P1-29 | 靜態陰影在載入後的第一個互動幀常會多重畫一次（2026-10-31 D.3-6a 驗證時發現，**既有行為**）：`StaticShadows` 在 `useFrame` 裡、也就是 `gl.render` 更新世界矩陣之前，記下可見投影物件的 id 與位置；GLB 部件掛載的那一幀記下的是尚未更新的矩陣，下一個真正畫出的幀看到正確位置，判斷為「投影物件改變」而再畫一次陰影。37 格實驗室頁在 `57364a2` 與 D.3-6a 都一樣：載入穩定後第一次互動多 1 次陰影 pass，之後 0；是否發生取決於掛載後是否已有其他幀。陰影結果正確，只是多畫一次 | D.3-6a 原樣搬移 `StaticShadows`，本輪不改（純重構不改變陰影 pass 次數）。影響 D.3-6b 的驗收方式：量「切換情境只重畫一次陰影」前要先讓頁面畫過一幀。可能做法：判斷鍵改用本地變換或在 render 之後記錄，需另行批准。證據：`logs/2026-10-31-d3-6a-environment.md` §3.5 |
| P1-30 | D.3-6a 效能判定 **Inconclusive（輕微）**（2026-10-31）：與 `57364a2` 比較，draw call、三角形、陰影 pass、shader 數量與畫面都相同，鏡頭飛行與環繞 FPS 未觀察到可穩定重現的下降；但在緊密配對測試中，**桌機 A2 預覽（`/islands/hex`）的首幀**仍有 +108 ms（+9.2%、8 對中 6 對較慢）的未確認訊號，手機與 19 格沒有。chunk 數量與大小不變（16 個、+0.1%），新程式每幀 ≤ 0.006 ms，找不到對應的程式路徑；量測期間另有其他工作階段的 GPU 基準測試佔用 CPU。全部是 SwiftShader 模擬 | 不阻擋 D.3-6b。後續：候選頁整合的 Level 3 驗收時在較安靜的機器上以配對方式重量首幀（A2 預覽與候選頁各 ≥ 12 對）；D.3-4B 真機一併記錄首幀，若同方向再做定向 profiling。證據：`logs/2026-10-31-d3-6a-environment.md` §6 |
| P1-13 | 燈塔／碼頭說明只能透過 3D 點擊觸發，鍵盤與螢幕閱讀器無對應入口 | 教材入口（工坊→`/learn`）在側欄有等價連結；說明內容屬補充資訊。若要完整等價，需在側欄或清單補說明，屬後續決定 |
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
