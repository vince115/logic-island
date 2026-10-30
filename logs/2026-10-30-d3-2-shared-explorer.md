# 2026-10-30 D.3-2：共用 Explorer（場景只負責 3D）

> 授權範圍同 D.3-0（批准 D.3-0～D.3-2，各自獨立 commit；正式 `/islands` 不切換；不刪舊渲染器、不改預覽路由）。D.3-2 完成後停止，等待 D.3-3 的批准。

## 1. 職責劃分

| 負責 | 元件 | 內容 |
|---|---|---|
| 3D 渲染 | `HexWorldScene` | 地形、海、植被、建築、道路、橋、光照、相機；島嶼名牌與 Anchor 標記（3D 定位的 HTML）；回報 `onSelect`、`onNavigate`（只回報 href）、`onReady`、`onUnavailable` |
| 產品邏輯 | `HexWorldExplorer`（共用） | 目前聚焦的島、3D／清單模式、HTML 地點清單與說明狀態、路由（`router.push`）、Error Boundary、WebGL 失效轉清單、課程側欄 |
| 頁面 | 各 page | 頁首文案、工具列連結（預覽頁的「回到正式群島地圖」改由頁面以 `PreviewBack` 傳入） |

具體改動：

- `HexWorldScene` 移除 `useRouter`：GLB 路由目標改呼叫 `onNavigate(href)`，由 Explorer 決定怎麼導航。
- `poiPanel` 從場景選項移到 Explorer 的 prop；canvas 的無障礙名稱改為 `label` prop，預設維持原文字。
- 新增 `scene-boundary.tsx`：場景外層的 Error Boundary。R3F 在 WebGL 無法建立時拋出 render 錯誤，由它接住後轉為清單模式。
- Explorer 新增：
  - 3D／清單切換；
  - WebGL 不可用、context 遺失或場景出錯時自動進清單，並停用「3D 群島」；
  - 清單模式下不掛載畫布。
- **聚焦時的島嶼名稱：** 大名牌在聚焦後讓位給 Anchor 標記（已批准的行為）。地圖本身的標題改為該島的英文名與中文名（例如「THE FIRST LIGHT／基礎程式島」），工具列也顯示島名，「返回全景」一直在地圖下緣。手機上工具列可能捲出畫面，地圖標題則跟著畫布。
- 正式 `/islands` 與它的舊 Explorer、`SceneBoundary` 都沒有改動，保持凍結作為回退。

## 2. 安全網對照（舊正式版 vs 共用 Explorer）

| 項目 | 正式 `/islands`（舊） | 共用 Explorer（D.3-2） | 測試 |
|---|---|---|---|
| 3D／清單切換 | 有 | 有 | 兩邊各自的 E2E（`e2e/fallbacks.ts`） |
| WebGL 無法建立 → Error Boundary → 清單 | 有 | 有 | 兩邊都測，且沒有未捕捉錯誤 |
| WebGL context 遺失 → 清單 | 有 | 有 | 兩邊都測 |
| GLB 載入失敗／契約節點缺失 → 暫代建築 | 有 | 有（另有地點清單可用） | 兩邊都測 |
| HTML 地點清單（觸控與鍵盤） | 無（P1-13） | 有 | 37 格 E2E |
| 聚焦時標示目前島嶼 | 名牌保持按下狀態 | 地圖標題＋工具列顯示島名；「返回全景」在畫面內 | 37 格 E2E（桌機與手機） |
| BFS 頁面附註 | 有（頁面層） | 由頁面提供；預覽頁沒有 | D.3-3 時由 `/islands` 頁面帶入 |

## 3. 驗證

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript／Build | 都是 exit 0／成功 |
| Vitest | 164 passed／6 skipped（資料指紋、preset 與匯入邊界不變） |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 216/216；新增 37 格的清單模式、Error Boundary、context 遺失、聚焦標題與返回 4 項，以及 A2 預覽的清單模式，桌機與手機各一 |
| E2E 全套（單次） | 91 passed／3 failed（P1-11） |
| 3D 畫面 | 只比畫布像素（探針渲染後 `toDataURL`，不含 HTML 疊層）：與 D.2c-2（`42b32bc`）在桌機與手機的全景與聚焦都是 0 像素差 |
| UI | 工具列多了 3D／清單切換，手機上換成第二行；聚焦時地圖標題改為島名。前後對照截圖見 §5 |
| 效能 | 見 §4 |

## 4. 效能（D.3-0 方法，SwiftShader 3 輪）

| 指標 | 37 格實驗室 桌機（D.3-1 → D.3-2） | 37 格實驗室 手機（D.3-1 → D.3-2） |
|---|---|---|
| 主畫面 draw call／三角形 | 全景 43／28,569，聚焦 26／38,339（不變） | 同左（不變） |
| 依島拆分（基礎／資料結構／演算法／共用） | 全景 8／10／10／15，聚焦 10／1／—／15（不變） | 不變 |
| 強制渲染 FPS（全景／聚焦） | 44.8／38.1 → 44.8／38.6 | 50.7／48.1 → 50.7／48.7 |
| 鏡頭飛行 FPS | 50.8 → 50.4 | 59.4 → 59.4 |
| 首幀／GLB 就緒（ms） | 1,370／2,351 → 1,370／2,334 | 1,386／2,334 → 1,370／2,306 |
| 對照：正式 `/islands` 飛行 FPS／首幀 | 60／819 ms | 60／820 ms |

- Explorer 的改動不影響渲染：draw call、三角形與依島拆分都不變，時間在量測誤差內。
- 37 格與正式版的差距（P1-26）維持 D.3-0 的結論。

## 5. 截圖

Scratch 目錄 `shots/d32/`：`d32-ui-desktop.png`、`d32-ui-mobile.png`（D.2c-2 對 D.3-2 的全景、聚焦，以及 D.3-2 的清單模式）。

## 6. D.3-3 切換的風險（待批准時參考）

1. **弱 GPU 的效能差距（P1-26）。** 軟體算圖下，37 格的鏡頭飛行 FPS 低於舊 `/islands`（D.3-0：桌機 38 對 60），首幀晚約 0.6 秒。Apple M6 上兩者都是 60 FPS。真機結果未知，建議 D.3-4 的真機量測排在切換之前，或切換時保留 `/islands/legacy`。
2. **測試契約改變。**
   - 舊版名牌在聚焦後仍是按下狀態，新版會隱藏；
   - 舊版 Anchor 是完整文字（「工坊 · 學習路線」），新版是精簡標記（「工坊」）；
   - 說明框改由 HTML 地點清單（`role=status`）提供，3D 泡泡在桌機只是鏡像。
   
   `islands.spec.ts` 需要依需求重寫；安全網部分（`e2e/fallbacks.ts`）可以直接沿用。
3. **頁面文案與無障礙名稱。** 共用 Explorer 的 section 名稱（「Hex World 六角聚落預覽」）、地圖標題（「三座聚落，以橋樑相連。」）與 canvas 名稱都是預覽用字。正式版需改用 `/islands` 原有的文案（「Logic Islands 邏輯群島地圖」等），D.3-3 時以 props 傳入。
4. **舊版有、新版沒有的元素：**
   - hover 光環；
   - 羅盤；
   - 頁尾「THINK · VISUALIZE · CODE」；
   - 工具列小字「ISOMETRIC EXPLORER」。
   
   要沿用或捨棄，需要產品決定。
5. **另外兩島外觀變簡單：** 已暫時接受；切換後會出現在正式頁。
6. **預算沒有餘裕：** 基礎程式島在手機聚焦時是 25 個 draw call（上限 25），兩座暫代島各 10 個材質（上限 10）。D.3-3 不應再加任何場景元素。
7. **深入檢查留在實驗室：** 依賴探針的檢查（名牌不遮地塊、靜態陰影逐像素、依島 draw call）在正式頁無法執行，只能在共用同一 preset 的 `/islands/hex/scale/37` 進行。兩邊的 preset 差異只有探針，由 `tests/scene-presets.test.ts` 鎖住。
8. **回退：** 切換時以 `/islands/legacy`（noindex）保留舊渲染器與舊 E2E。回退方式是把 `/islands` 改回渲染舊 Explorer（單一 commit）。
