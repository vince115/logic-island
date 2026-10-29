# Logic Island 專案總覽

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 根目錄與產品定位

實際根目錄：`/Users/vincelo/dev-hub/github/vince115/logic-island`（2026-10-29 盤點時仍為舊路徑 `/Users/vincelo/dev-hub/github/vince115/logic-lab`；GitHub repository 預定為 `https://github.com/vince115/logic-island.git`，本機尚未連結）；`pwd` 與 `package.json`、`src/app/` 已核對。這是本地專案目錄，**不是 Git checkout**；不存在 `.git`，`git rev-parse --show-toplevel`／`git status` 失敗。不能提供有效分支、HEAD、remote 或未提交 diff；詳見 [狀態與 Git](IMPLEMENTATION_STATUS.md)。

Logic Island（程式邏輯島，原名 LogicLab）是繁體中文的程式邏輯、資料結構與演算法互動學習前端，標語 Think · Visualize · Code。以教材、可逐步操作的視覺化、C++／Python／Java 固定範例連結概念與程式。目標使用者包含程式入門、APCS 與 DSA 學習者；依據 `README.md`、`src/app/page.tsx`、`src/content/courses.ts`。

不含登入、API route、資料庫、OJ、伺服器程式碼執行、付款或學習進度保存；沒有對應實作。Logic Islands（邏輯群島）為教材的導航原型，不是演算法引擎替代品。

> 2026-10-29：長期產品方向調整為「程式設計、資料結構、演算法與人工智慧的互動式學習世界」，規劃 Coding／AI 雙群島；AI 部分（Phase H–J）尚未批准實作，上述現況不變。見 [ROADMAP](ROADMAP.md)。

## 技術版本與依賴

已逐一核對根目錄 `package.json` 與實際 `node_modules/<package>/package.json`，下列版本吻合；鎖定檔為 `pnpm-lock.yaml`。

| 類別 | 套件／版本 |
|---|---|
| Web | Next.js 16.4.3、React／react-dom 19.3.1，App Router |
| 語言 | TypeScript 5.9.3，strict、noEmit、bundler resolution、`@/*`→`src/*` |
| 樣式 | Tailwind／@tailwindcss/postcss 4.3.3、全站 `src/app/globals.css` |
| UI | Motion 14.6.0、lucide-react 1.62.0、@radix-ui/react-slot 1.5.0、CVA 0.7.1、clsx 2.1.1、tailwind-merge 3.7.0 |
| 3D | three 0.186.1、@react-three/fiber 9.8.2、@react-three/drei 10.7.9 |
| 品質 | ESLint 9.39.4、eslint-config-next 16.4.3、Vitest 5.0.5、Testing Library 16.3.3、jsdom 30.1.3、Playwright 1.64.1 |
| 套件管理 | `packageManager: pnpm@12.14.0`；`pnpm-workspace.yaml` 只允許 unrs-resolver build，沒有多 package 工作區 |

本輪環境：Node v24.22.0、pnpm 12.14.0、Darwin 27.0.0 arm64、Python 3.15.0、Apple clang 21.0.0；Java／JDK 不存在。版本為當前環境實測，不是其他電腦的安裝保證。

**Next.js 特別規則**：依根目錄 `AGENTS.md`，未來寫程式前要讀安裝內 `node_modules/next/dist/docs/` 的相關指南，不以一般 Next.js 記憶替代。教材動態頁已使用 `params: Promise<{slug:string}>`，不要改回同步假設。

## 路由與主要責任

| 路由 | 原始碼 | 當前內容／狀態 |
|---|---|---|
| `/` | `src/app/page.tsx` | 首頁、六課程入口、靜態氣泡排序宣傳圖；Implemented |
| `/learn` | `src/app/learn/page.tsx` | Catalog 教材分類清單；Implemented |
| `/learn/[slug]` | `src/app/learn/[slug]/page.tsx` | 六份 Lesson＋Lab；靜態 params，未知 slug notFound |
| `/visualize` | `src/app/visualize/page.tsx` | 同教材清單、不同入口文案 |
| `/visualize/[slug]` | `src/app/visualize/[slug]/page.tsx` | 共用 Lesson／Lab，以實驗為主 |
| `/islands` | `src/app/islands/page.tsx` | Phase 2A 三島原創幾何 R3F 原型；Partial／Blocked 建置 |
| 404 | `src/app/not-found.tsx` | 未知路徑與教材 slug |

六個 slug：`array`、`stack`、`queue`、`binary-search`、`bubble-sort`、`bfs`。預期功能路由共 16 個（含六 learn 與六 visualize），不含內建錯誤頁；本輪 build 失敗，不能稱已成功產生全部路由。原 `.next` 沒有 `/islands`，屬舊輸出，不應拿來驗收目前程式。

主 Header 目前只有 `/learn`、`/visualize`，未找到 `/islands` 導覽連結（`src/components/header.tsx`）。不存在教材資料庫或 CMS，課程全部由 `src/content/courses.ts` 管理；島嶼由 `src/lib/islands/data.ts` 管理。

## 環境變數與啟動

應用程式直接讀取的必要環境變數：**未找到**。本地來源與設定未找到 `process.env`／`import.meta.env`，根目錄沒有 `.env*`。未讀取或輸出任何秘密值。測試時使用的 `NEXT_TELEMETRY_DISABLED` 只是本輪關閉 Next 遙測，不是產品必填變數。未找到部署設定或遠端環境，不能推定部署端沒有其他需求。

`localStorage` 只保存 `logiclab-theme` 主題偏好；無學習進度持久化。證據：`src/app/layout.tsx`、`src/components/theme-toggle.tsx`。

日常指令以 `package.json` 為準：`pnpm dev`、`pnpm build`、`pnpm start`、`pnpm lint`、`pnpm test`、`pnpm test:e2e`。TypeScript 用 `pnpm exec tsc --noEmit --incremental false`，測試清單用 `pnpm exec playwright test --list`。這些是操作指令，**目前不能宣稱全部通過**；請讀 [測試狀態](TESTING_STATUS.md)。

## 接手入口

先讀 [CLAUDE_HANDOFF](CLAUDE_HANDOFF.md) → [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md) → [KNOWN_ISSUES](KNOWN_ISSUES.md)，再依需要閱讀 [架構](ARCHITECTURE.md)、[資產](BLENDER_ASSET_INVENTORY.md)、[下一步](NEXT_STEPS.md)。本輪原始證據在 `docs/handoff/evidence/`。
