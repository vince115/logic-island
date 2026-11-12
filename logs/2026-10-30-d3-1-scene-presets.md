# 2026-10-30 D.3-1：統一場景設定（正式資料、具名 preset、探針隔離）

> 授權範圍同 D.3-0（批准 D.3-0～D.3-2，各自獨立 commit；正式 `/islands` 不切換）。本階段只重整程式結構，原型的畫面與互動不變。

## 1. 37 格正式資料與 19 格原型資料分離

| 模組 | 內容 | 誰使用 |
|---|---|---|
| `src/lib/islands/islands-world.ts`（新） | `islandsWorld`：37 格基礎程式島＋另外兩島的六角聚落、橋樑、GLB 配置、自然配置 | 正式候選；37 格實驗室 |
| `src/lib/islands/hex-layout.ts`（新） | `WorldLayout` 型別、`LayoutSpec`＋`assembleLayout()`、地塊與暫代島建構、工坊門與燈塔前緣、自然配置 | 兩份世界共用 |
| `src/lib/islands/hex-nature-data.ts`（新） | 森林、GLB 樹、海岸岩石、浪花、淺水、道路地塊（由原型檔原樣移出） | 渲染元件與所有世界 |
| `src/lib/islands/hex-scale-prototype.ts` | 只剩 19 格的 `LayoutSpec`，以及 `scalePrototypes`（`'37'` 直接使用 `islandsWorld`） | 只有 `/islands/hex/scale/*` |

- 原本的 `prototype(variant)` 用 `big ? … : …` 把兩種尺度混在一起；改成各自宣告一份 `LayoutSpec`，交給同一個 `assembleLayout()`。物件的鍵順序與原本相同。
- `tests/world-data.test.ts` 的指紋在搬移後**完全不變**（A2、19 格、37 格全部），並多一項：原型的 37 格就是 `islandsWorld` 本身。
- 渲染元件不再匯入原型模組（`hex-nature.tsx`、`hex-ocean.tsx`、`hex-world-scene.tsx`、`hex-natural-scene.ts` 改由新模組匯入）。正式頁也不會再連帶算出 19 格世界。

## 2. 具名 scene preset

`src/components/islands/hex-world/hex-scene-presets.ts`：

| preset | 內容 | 用在 |
|---|---|---|
| `production` | D.2c 的自然地形、海面與植被、精簡名牌、依輪廓取景，加上 D.2c-2 的靜態陰影與 `treeLod: 24` | 目前沒有頁面直接使用；D.3-3 才會用在 `/islands` |
| `lab` | `production`＋`perfProbe` | 隱藏測試頁 `/islands/hex/scale/37` |
| `scale19` | 19 格參考原型的原設定 | `/islands/hex/scale/19` |
| `a2Preview` | 場景預設值 | `/islands/hex` |

- preset 只描述「怎麼畫」。世界資料（GLB 配置、森林、自然配置）來自 `WorldLayout`；地點面板是 Explorer 的 UI，都不放在 preset 裡。
- Tree LOD 門檻由 Explorer 移到 `production` preset（KNOWN_ISSUES P1-24：已不綁 Explorer；移進 Phase E schema 的 `scene` 區塊仍待後續）。

## 3. 正式設定不載入量測探針

- `PerfProbe` 原樣移到 `hex-perf-probe.tsx`，只在 `perfProbe` 開啟時以 `React.lazy` 載入（Next 16 lazy loading 指南：`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`）。
- build 後實測：探針在獨立 chunk。`/islands` 與 `/islands/hex` 都沒有下載這個 chunk，canvas 上也沒有 `__hex*`；只有 `/islands/hex/scale/37` 會載入。
- `tests/scene-presets.test.ts` 鎖住幾件事：
  - `production` 沒有 `perfProbe`，`lab` 恰好是 `production`＋探針；
  - 只有尺度原型的兩個入口匯入原型模組；
  - 探針只能以動態 `import()` 載入。

## 4. 驗證

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript／Build | 都是 exit 0／成功 |
| Vitest | 164 passed／6 skipped；新增 `tests/scene-presets.test.ts` 4 項；世界資料指紋不變 |
| 畫面 | 37 格實驗室在同一鏡頭下，與 D.2c-2（`42b32bc`）的截圖逐像素相同（桌機 DPR 1／DPR 2、手機；全景與聚焦，6 張都是 0 像素差） |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 186/186 |
| E2E 全套 | 81 passed／3 failed（P1-11） |

## 5. 效能（D.3-0 方法，SwiftShader 3 輪）

| 指標 | 37 格實驗室 桌機 | 37 格實驗室 手機 |
|---|---|---|
| 主畫面 draw call／三角形，全景 | 43／28,569（與基準相同） | 43／28,569（相同） |
| 主畫面 draw call／三角形，聚焦 | 26／38,339（相同） | 26／38,339（相同） |
| 依島拆分（基礎／資料結構／演算法／共用） | 全景 8／10／10／15，聚焦 10／1／—／15（相同） | 相同 |
| 強制渲染 FPS（全景／聚焦） | 44.8／38.1（基準 28.0／25.5） | 50.7／48.1（基準 47.4／48.4） |
| 鏡頭飛行 FPS | 50.8（基準 38.1） | 59.4（基準 57.4） |
| 首幀／GLB 就緒（ms） | 1,370／2,351（基準 1,576／2,372） | 1,386／2,334（基準 1,643／2,406） |

- draw call、三角形、依島拆分都和基準完全相同，畫面也逐像素相同：渲染內容沒有改變。
- 時間類數字比基準好，但同一輪裡未改動的正式 `/islands` 也變快了（首幀 939 → 803 ms），所以主要是量測時機器負載較低，不是本階段的改善。
- 依 D.3-0 建議的門檻（不低於基準 90%），本階段通過。
