# 2026-10-29 Phase D 實作前審查

> 只做唯讀審查，Phase D 尚未批准，沒有修改程式、GLB、測試或 `public/`。資產讀取自保全庫 `/Users/vincelo/dev-hub/assets/logic-island/codex-visualizations-20261028-01a181a6/basics-v2.1/`。

## 1. 審查對象

| 項目 | 值 |
|---|---|
| 檔案 | `logiclab-basics-island-v2.1.glb` |
| bytes | 879,748（JSON chunk 22,980／BIN chunk 856,740） |
| SHA-256 | `7cb4272734b5d1c7bcd68d2ba340206fdef55623bf0f011f6152a1b7bd468957`（與保全庫 MANIFEST 相符） |
| 保全庫完整性 | `shasum -a 256 -c SHA256SUMS`：81/81 OK |
| 產生器 | Khronos glTF Blender I/O v5.2.40 |
| 結構 | 46 nodes、24 meshes／24 primitives、9,800 triangles、2 materials、0 textures、無動畫／skin／morph |
| 擴充 | `extensionsUsed: [KHR_materials_emissive_strength]`，無 `extensionsRequired`；three 0.186 GLTFLoader 支援 |

## 2. C.1 七項條件對照

| # | 條件 | 結果 | 證據／D 的處理 |
|---|---|---|---|
| 1 | 技術驗收通過、視覺有條件接受 | ✅ 符合 | `Polish_Khronos_Validation.json`：0 errors／0 warnings／1 info（`/meshes/7/primitives/0/attributes/TEXCOORD_0` 未使用）；24 draw calls、2 材質、0.84 MiB，都在 Style Guide 單島預算內（手機 ≤25 calls、≤10 材質、≈≤1.5 MiB） |
| 2 | 保留 v2、v2.1 BLEND／GLB 與紀錄 | ✅ 符合 | 保全庫 81/81 SHA 相符；D 只讀取保全庫，不改、不搬 |
| 3 | 屋頂／峽谷／地形列為後續美術 | ✅ 不在 D 範圍 | D 不修改 GLB 幾何 |
| 4 | 手機文字由 HTML UI 解決 | ✅ 規劃中 | D.1 在 Anchor 位置用 drei `Html` 顯示標籤；不再新增 GLB 幾何文字（v2.1 既有的 `Workshop_Code_Slash`、`Dock_START_Marker` 保留） |
| 5 | 發布 GLB 不含 `blendermcp_server_running` | ❌ **來源檔不符合** | `scenes[0].extras = {"blendermcp_server_running": 1}`。D.0 必須產生衍生 runtime GLB 移除此欄位，並以測試確保 `public/` 內的 GLB 不含此字串 |
| 6 | interaction_id／Anchor／Node Contract 相容 | ✅ 符合 | 見第 3 節：契約 43 節點父子與世界座標全部相符 |
| 7 | 以獨立版本資訊追蹤，不依賴舊 asset_id | ⚠️ 資產本身未更新（依決議不改） | root extras 仍是 `asset_id: logiclab-basics-island-v2`、`schema_version: 1.0`。D 的 registry 與 provenance 必須另存 `version: 2.1`、來源 SHA 與輸出 SHA；程式不得讀 `asset_id` 判斷版本 |

**結論**：條件 5、7 是 D.0 必須完成的工作，不是阻擋；其餘條件都符合。

## 3. interaction_id、Anchor、Node Contract

以 `v2_Node_Contract.json`（Blender Z-up 世界矩陣）對照 GLB（glTF Y-up，轉換 `(x, y, z)_blender → (x, z, -y)_gltf`）：

- 43 個契約節點**父節點與世界座標全部相符**，所有節點都沒有 rotation／scale／matrix。
- 新增 3 個節點：`Workshop_Code_Slash`、`Dock_START_Marker`、`Central_Low_Planting`，與 `Node_Contract_Validation.json` 一致。
- 場景根只有 `Island_Basics_Root`（extras `role: island`）。

帶語意的節點：

| 節點 | 父節點 | role | interaction_id | 其他 | 有 mesh |
|---|---|---|---|---|---|
| `Building_Workshop` | Buildings | course_entry | `learn` | `route: /learn` | 子節點 |
| `Landmark_Lighthouse` | Buildings | learning_landmark | `lighthouse` | — | 子節點 |
| `Dock_Entry` | Infrastructure | entry | `entry` | — | 子節點 |
| `Anchor_Workshop` | Anchors | learn | `learn` | GLB 座標 (-2.3, 0.8, 0.85) | 否 |
| `Anchor_Lighthouse` | Anchors | lighthouse | `lighthouse` | (2.9, 1.65, -0.72) | 否 |
| `Anchor_Entry` | Anchors | entry | `entry` | (-4, 0.2, 3.1) | 否 |
| `Anchor_Route_Exit` | Anchors | route_exit | `route_exit` | (4, 0.35, 1.6) | 否 |
| `Tree_001`～`Tree_005` | Vegetation.001 | tree | — | — | 子節點 |

對實作的影響：

- 點擊判定只從**可見 mesh 往上找**最近的 `interaction_id`；Anchor 沒有 mesh，只用來放 HTML 標籤，不參與 raycast。
- `learn` 同時出現在 `Building_Workshop` 與 `Anchor_Workshop`，解析時以節點 role 區分「點擊目標」與「標籤位置」，不能用 interaction_id 當唯一鍵。
- `route_exit` 只有 Anchor、沒有可點擊 mesh；D 不賦予行為，保留給 Phase E 的島嶼關聯。
- 樹與地形沒有 interaction_id，點到時退回「選取整座島」。

尺寸：GLB 包圍盒 min (-5.45, -3.96, -3.64)、max (5.17, 5.81, 4.92)，約為原型基礎島（±3.2）的 1.65 倍，需縮放約 0.6；底部 -3.96×0.6 ≈ -2.38，低於海面 -2.08，等於讓島身部分沉入海中（原規劃建議的做法）。

## 4. 修改檔案範圍

**新增**

| 檔案 | 用途 |
|---|---|
| `public/models/islands/basics-island.v2.1.glb` | 衍生 runtime GLB（約 880 KB；專案目前沒有 `public/`） |
| `scripts/assets/derive-runtime-glb.mjs` | 只用 Node 內建模組：驗證來源 SHA → 移除 scene extras 旗標 → BIN chunk 原樣保留 → 輸出並記錄 SHA |
| `docs/assets/basics-island-v2.1.provenance.json` | 來源路徑、來源／輸出 SHA、bytes、版本、處理步驟 |
| `src/lib/islands/interaction.ts` | 純函式：由節點往上解析 interaction_id，可單元測試 |
| `src/components/islands/glb-island-model.tsx` | `useGLTF(url, false)`、clone、陰影設定、Anchor 標籤 |
| `tests/islands-registry.test.ts`、`tests/islands-interaction.test.ts`、`tests/runtime-glb.test.ts` | 單元測試（runtime GLB 測試直接在 Node 解析 JSON chunk） |
| `e2e/islands.spec.ts` | `/islands` 載入、清單 fallback、鍵盤、路由 |
| `.gitattributes` | `*.glb binary` |

**修改**

| 檔案 | 變更 |
|---|---|
| `src/lib/islands/types.ts` | `IslandModelId` 新增 GLB 模型 key |
| `src/lib/islands/asset-registry.ts` | 改為 discriminated union：`original-geometry`／`glb`（url、version、sha256、bytes、scale、offset、fallback） |
| `src/lib/islands/data.ts` | 基礎程式島 `modelId` 改指 GLB；依實際尺寸更新 bounds |
| `src/components/islands/island.tsx` | 依來源型別分支；Suspense 與個別島 error boundary；點擊先解析 interaction_id，再退回選島 |
| `docs/handoff/*`、保全庫 `README.md` | 完成後同步狀態 |

**不修改**：`courses.ts`、`engine.ts`、`lab.tsx`、learn／visualize 路由、另外兩島模型、`island-scene.tsx` 的光照與海面（D.2 才評估）、`package.json`／lockfile（不新增套件）、保全庫與 Codex 原檔。

## 5. 可能影響

- **載入量**：`/islands` 多下載約 880 KB；場景已由 `next/dynamic` 延遲載入，不影響教材頁。`public/` 預設 `Cache-Control: max-age=0`，每次都會重新驗證；檔名已帶版本，日後可另外設長快取（需新增 `next.config`，另行決定）。
- **外部請求**：drei `useGLTF` 預設從 gstatic 載入 Draco decoder；本 GLB 沒有 Draco 壓縮，第二參數傳 `false` 可避免任何外部請求。
- **快取與卸載**：`useGLTF` 快取共用同一個 scene，元件 clone 後使用，卸載時不 dispose 共用的 geometry／material；需要驗證 StrictMode 重複掛載不會殘留物件。
- **效能**：24 個 mesh 都開 castShadow 時，陰影 pass 的 draw calls 會增加；需用 `renderer.info` 量測三島合計，不能拿單島 24 calls 代表整體。
- **互動**：原型是「點整座島」，D 之後要多一層「點到特定節點」；未選取的島點擊仍只做選取，避免誤觸換頁。
- **可存取性**：清單導航、鍵盤操作、WebGL 不可用與 contextlost 的 fallback 都必須保留。

## 6. 實作步驟

| 階段 | 內容 | 完成門檻 |
|---|---|---|
| D.0 | 衍生 runtime GLB、provenance、registry 型別、`.gitattributes`、單元測試 | 輸出 GLB 不含旗標，BIN 與來源 byte 相同，SHA 已記錄，測試通過 |
| D.1 | GLB 載入元件、Suspense／error boundary、interaction 解析、Anchor HTML 標籤、bounds 更新 | 基礎島顯示 GLB；工坊導向 `/learn`；載入失敗時回到原創幾何 |
| D.2（可選） | 地標鏡頭拉近、光照與材質微調 | 需另外同意 |
| D.3 | E2E、效能量測、Z-fighting 鏡頭檢查、桌機與手機視窗、真機 | 達到 [NEXT_STEPS §5](../docs/handoff/NEXT_STEPS.md) 的驗收門檻 |

## 7. 測試計畫

1. **單元測試（Vitest）**
   - registry 型別與 fallback；
   - interaction 解析：mesh 子節點 → 父節點的 id，樹 → null；
   - runtime GLB：不含 `blendermcp_server_running`、SHA 與 provenance 一致、四個 Anchor 與三個語意節點存在、43 個契約節點父子關係不變；
   - 既有 45 項測試照常通過。
2. **靜態檢查**：在隔離副本執行 eslint、tsc、vitest、`next build`，避免污染工作目錄的 `.next`。
3. **E2E（Playwright）**
   - 既有 22 個案例；
   - 新增 `/islands`：canvas 出現、清單導航可用、鍵盤可聚焦、工坊路由正確；
   - 模擬 GLB 404 時應回到原創幾何。
4. **瀏覽器實測**：桌機與 375 px 手機視窗；console 無錯誤；`renderer.info` 記錄 draw calls／三角形數；近、遠鏡頭檢查 Z-fighting。
5. **真機**：Android、iPhone 至少各一台，需要使用者協助；結果與模擬分開記錄。

## 8. 回滾方案

1. **執行期自動回退**：GLB 載入失敗或 WebGL 不可用時，error boundary 顯示原創幾何，清單導航不受影響。
2. **設定回退**：registry 中基礎島的 `modelId` 改回 `beacon-workshop`（一行），原創幾何元件保留不刪。
3. **版本回退**：D 在獨立分支開發，經批准才合併；出問題時 `git revert` D 的 commit（不 reset、不 force push）。
4. **資產**：保全庫與 Codex 原檔都不會被改動，不需要資產回滾；runtime GLB 可以隨時用 derive 腳本從保全庫重新產生。

## 9. 開始 D 前需要決定的事

1. **島嶼放置**：建議縮放約 0.6、部分沉入海面。
2. **燈塔與入口的行為**：建議只顯示說明；只有工坊導向 `/learn`。
3. **gltf-validator**：是否加為 devDependency。建議不加，改用保全庫的 Khronos 報告加上本地結構測試。
4. **地標鏡頭拉近**：建議延到 D.2。
5. **runtime 路徑與檔名**：建議 `public/models/islands/basics-island.v2.1.glb`。
6. **分支策略**：建議用 `phase-d/basics-glb` 分支，經批准後再合併 main。
7. **長快取標頭**：是否新增 `next.config`。建議 D 先不做。
