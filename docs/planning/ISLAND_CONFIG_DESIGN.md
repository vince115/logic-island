# 資料驅動的島嶼設定（Island Configuration Design）

> Phase F.0 規劃文件（2026-11-02）。**只是設計與 Schema 範例，沒有修改正式程式碼。** 延續 [ROADMAP](../handoff/ROADMAP.md) Phase E
> 「Data-Driven Islands」的原則（同一套 schema、型別化、與 GLB Node Contract 相容），並擴充到 15＋1 座島與兩個區域。

## 1. 四種資料，分開存放

| 種類 | 內容 | 存放 | 誰寫 | 例 |
|---|---|---|---|---|
| **Static Configuration** | 區域、島嶼、主題、地圖位置、互動物件、資產引用、課程清單（只放 ID）、解鎖規則（宣告式） | 版控中的設定檔（TS 模組或 JSON） | 開發者 | `databases` 島在 CS 區、課程 DB01–DB20 |
| **Curriculum Content** | 每堂課的大綱與完整教材 | `src/content/curriculum/`（現有） | 教材作者 | DB03 的範例與測驗 |
| **User Progress** | 讀過、測驗、完成、徽章 | 瀏覽器 localStorage（現有 `progress.ts`，版本化）；未來可能同步到後端 | 執行期 | `DB03: completed` |
| **Runtime World State** | 目前區域、鏡頭、聚焦島、清單開關、時段 | React state／URL／localStorage 偏好 | 執行期 | `region=cs`、聚焦 `databases` |

**使用者進度永遠不寫進靜態設定**；靜態設定裡的「解鎖條件」只是規則，判定由進度層在執行期計算。`completionStatus`（課程是否已完成製作）是**內容狀態**，由課程資料推導，不是使用者進度。

## 2. JSON Schema 草案

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "logic-island/world-config.schema.json",
  "type": "object",
  "required": ["version", "regions", "islands"],
  "properties": {
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "regions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "nameZh", "nameEn", "order"],
        "properties": {
          "id": { "enum": ["cs", "ai"] },
          "nameZh": { "type": "string" }, "nameEn": { "type": "string" },
          "order": { "type": "integer" },
          "map": { "$ref": "#/$defs/mapRef" }
        }
      }
    },
    "islands": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "kind", "region", "code", "nameZh", "nameEn", "theme", "courses", "status", "version"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z]+(-[a-z]+)*$" },
          "kind": { "enum": ["subject", "tool", "challenge"] },
          "region": { "enum": ["cs", "ai", "hub"] },
          "code": { "type": "string", "pattern": "^[A-Z]{1,4}$" },
          "order": { "type": "integer", "minimum": 1 },
          "nameZh": { "type": "string" }, "nameEn": { "type": "string" },
          "summaryZh": { "type": "string" },
          "theme": {
            "type": "object", "required": ["accent"],
            "properties": { "accent": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" }, "landmark": { "type": "string" }, "terrain": { "type": "string" } }
          },
          "courses": {
            "type": "object", "required": ["lessonPrefix", "lessonCount"],
            "properties": {
              "lessonPrefix": { "type": "string" },
              "lessonCount": { "type": "integer" },
              "labs": { "type": "array", "items": { "type": "string" } }
            }
          },
          "status": { "enum": ["complete", "planned", "unannounced"] },
          "entryPoints": { "type": "array", "items": { "$ref": "#/$defs/entryPoint" } },
          "interactiveObjects": { "type": "array", "items": { "$ref": "#/$defs/interactiveObject" } },
          "unlock": { "$ref": "#/$defs/condition" },
          "links": { "type": "array", "items": { "type": "object", "required": ["to", "kind"], "properties": { "to": { "type": "string" }, "kind": { "enum": ["bridge", "route", "recommended-next"] } } } },
          "assets": { "type": "object", "properties": { "glb": { "type": "string" }, "fallback": { "type": "string" } } },
          "map": { "$ref": "#/$defs/mapRef" },
          "version": { "type": "string" }
        }
      }
    }
  },
  "$defs": {
    "mapRef": { "type": "object", "properties": { "center": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 }, "shape": { "type": "string" } } },
    "entryPoint": { "type": "object", "required": ["id", "target"], "properties": { "id": { "type": "string" }, "labelZh": { "type": "string" }, "target": { "type": "string", "description": "route: /curriculum/<slug>, /learn/<slug>, /curriculum#<islandId>" } } },
    "interactiveObject": { "type": "object", "required": ["interactionId", "action"], "properties": { "interactionId": { "type": "string" }, "node": { "type": "string" }, "action": { "enum": ["route", "info", "activity", "challenge"] }, "target": { "type": "string" } } },
    "condition": {
      "oneOf": [
        { "type": "object", "required": ["completedLessons"], "properties": { "completedLessons": { "type": "array", "items": { "type": "string" } } } },
        { "type": "object", "required": ["completedIslands"], "properties": { "completedIslands": { "type": "array", "items": { "type": "string" } } } },
        { "type": "object", "required": ["all"], "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/condition" } } } },
        { "type": "object", "required": ["any"], "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/condition" } } } }
      ]
    }
  }
}
```

## 3. TypeScript 型別草案

專案原則是「TypeScript 模組＋`satisfies` 型別檢查為主，必要時輸出 JSON；不為此引入新的 schema 套件」（ROADMAP Phase E）。因此**主要來源是 TS 設定檔**，JSON Schema 由型別產生或手寫維護，用於外部工具與文件。

```ts
export type RegionId = 'cs' | 'ai';
export type IslandKind = 'subject' | 'tool' | 'challenge';
/** 完整前綴；既有三島沿用 F／D／A。 */
export type LessonPrefix = 'F' | 'D' | 'A' | 'PL' | 'DB' | 'CN' | 'SA' | 'MIS' | 'AIF' | 'ML' | 'DL' | 'LLM' | 'GEN' | 'AG' | 'OPS';
export type LessonId = `${LessonPrefix}${number}`;   // 解析一律用完整前綴 regex，見 §6

export type Condition =
  | { completedLessons: LessonId[] }
  | { completedIslands: string[] }
  | { all: Condition[] }
  | { any: Condition[] };

export interface IslandConfig {
  id: string;                       // kebab-case，穩定
  kind: IslandKind;
  region: RegionId | 'hub';
  code: string;                     // 顯示代碼：DB、AG…（實驗島為 LAB，但不編號）
  order?: number;                   // 區域內的學科編號 1..n；tool 島沒有
  nameZh: string; nameEn: string; summaryZh: string;
  theme: { accent: string; landmark?: string; terrain?: string };
  courses: { lessonPrefix?: LessonPrefix; lessonCount?: number; labs?: string[] };
  status: 'complete' | 'planned' | 'unannounced';     // 內容狀態，不是使用者進度
  entryPoints?: { id: string; labelZh: string; target: string }[];
  interactiveObjects?: { interactionId: string; node?: string; action: 'route' | 'info' | 'activity' | 'challenge'; target?: string }[];
  unlock?: Condition;               // 只給獎勵／挑戰島；學科島不硬鎖
  links?: { to: string; kind: 'bridge' | 'route' | 'recommended-next' }[];
  assets?: { glb?: string; fallback?: string };       // registry key，不寫死 URL
  map?: { center: [number, number]; shape?: string }; // 區域地圖上的六角座標
  version: string;
}

export interface WorldConfig { version: string; regions: { id: RegionId; nameZh: string; nameEn: string; order: number }[]; islands: IslandConfig[] }
```

範例（規劃中的資料庫應用島）：

```ts
{
  id: 'databases', kind: 'subject', region: 'cs', code: 'DB', order: 5,
  nameZh: '資料庫應用島', nameEn: 'Database Applications',
  summaryZh: '關聯模型、SQL、ER 與正規化、交易與索引；資料庫引擎內部不在範圍。',
  theme: { accent: '#2f7d6d', landmark: '資料倉庫燈塔' },
  courses: { lessonPrefix: 'DB', lessonCount: 20 },
  status: 'planned',
  entryPoints: [{ id: 'syllabus', labelZh: '課綱', target: '/curriculum#databases' }],
  interactiveObjects: [{ interactionId: 'sql-lab', action: 'activity', target: 'sql-playground' }],
  links: [{ to: 'programming-languages', kind: 'bridge' }, { to: 'systems-analysis', kind: 'recommended-next' }],
  map: { center: [12, -6] },
  version: '0.1.0',
} satisfies IslandConfig
```

## 4. Registry 設計

```
src/content/world/            （規劃，F.0 實作時建立）
├─ regions.ts                 兩個區域
├─ islands/<id>.ts            每座島一個檔（satisfies IslandConfig）
├─ index.ts                   組成 WorldConfig、提供 getIsland／islandsInRegion／islandOfLesson
└─ validate.ts                validateWorld(world, curriculum) → problems[]
```

- 課程大綱與島嶼設定的關聯**只透過 Lesson ID 前綴與 `courses`**；課程內容模組不需要知道地圖。
- 現有 `src/lib/islands/data.ts`（`IslandDefinition`）與 `islands-world.ts`（地圖佈局）先由 registry 產生，介面不變（向後相容），再逐步讓 3D 元件改讀 registry。

## 5. 驗證策略

`validateWorld` 比照現有 `validateCurriculum`，以單元測試執行：

| 檢查 | 內容 |
|---|---|
| 數量 | 15 座 subject、1 座 tool；CS 8、AI 7；`lessonCount` 總和 320 |
| 唯一 | island `id`、`code`、`lessonPrefix`、區域內 `order` 不重複 |
| 前綴 | 所有 Lesson ID 能以完整前綴 regex 解析，且前綴對應到唯一的島 |
| 課程 | `status: complete` 的島，課程資料都存在且完整；`planned` 的島可只有大綱 |
| 連結 | `links`、`entryPoints`、`interactiveObjects.target` 指向存在的島／路由／活動 |
| 條件 | `unlock` 只引用存在的課程與島；學科島沒有 `unlock`（不硬鎖） |
| GLB | `interactionId` 能在對應 GLB 的 Node Contract 找到（沿用 `glb-contract.ts`） |
| 地圖 | 同一區域的島 `map.center` 不重疊，聚落間至少隔一格水面（沿用 `validateHexWorld`） |

## 6. Lesson ID 與前綴

- 解析：`^(F|D|A|PL|DB|CN|SA|MIS|AIF|ML|DL|LLM|GEN|AG|OPS)(\d{2})$`。
- 必須修改的現有程式（F.0 實作時）：`schema.ts` 的 `LessonId` 型別、`ISLAND_PREFIX` 的使用處與 `validateCurriculum` 的 `startsWith` 判斷、`LESSONS_PER_ISLAND`（改為每島 `lessonCount`，因為 ML／DL／LLM／AG 是 25 堂）、`ISLAND_IDS`（改由 registry 產生）。
- 進度資料以 Lesson ID 為 key（`progress.ts`），**既有 F／D／A 的 ID 不變**，因此已存在的使用者進度不需要遷移。

## 7. 向後相容與遷移

| 步驟 | 內容 | 使用者可見變化 |
|---|---|---|
| 1 | 新增 registry，內容只有現有 3 座學科島＋實驗島；以它產生既有的 `IslandDefinition` 與首頁世界 | 無 |
| 2 | 修正 Lesson ID 前綴解析與每島課數 | 無 |
| 3 | 加入 12 座規劃中島嶼（`status: planned`），課程只有大綱（藍圖資料） | 課綱頁可顯示規劃中島嶼（可選） |
| 4 | 航行指南與首頁讀 registry（實驗島置前、無編號、狀態分明） | 航行指南改版（E.5／M2） |
| 5 | 區域地圖讀 registry 的 `map` | CS 區域地圖（M3） |

- 既有路由（`/curriculum/[slug]`、`/learn/[slug]`）、slug、Lesson ID、`islandId`、localStorage key 全部不變。
- `/islands` 與 `/islands/candidate` 在遷移完成前維持現況（受保護）。
- 藍圖資料 [`data/curriculum-blueprint.json`](data/curriculum-blueprint.json) 是規劃用的來源；實際上線時轉成 `lessons.ts` 的大綱格式（欄位對應：`titleZh → title`、`objectives → learningObjectives`、`concepts`、`difficulty`、`prerequisites`、`activity → visualizationType／activity`），並由 `validateCurriculum` 檢查。
