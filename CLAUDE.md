# Logic Island（程式邏輯島）— Agent 指引

- 先讀 [交接入口](docs/handoff/CLAUDE_HANDOFF.md)、[實作與批准狀態](docs/handoff/IMPLEMENTATION_STATUS.md)、[已知問題](docs/handoff/KNOWN_ISSUES.md)。實際檔案與當前任務授權優先，不能由舊報告推定已通過或已批准。
- 遵守根目錄 [AGENTS.md](AGENTS.md)。本案 Next.js 版本有特殊API／規約，寫程式前讀安裝內 `node_modules/next/dist/docs/` 的相關指南。
- 使用 TypeScript strict、App Router、`@/*` alias與專案鎖定的pnpm／lockfile；不為交接自動升級套件。
- 教材真實來源是 `src/content/courses.ts`，純快照引擎是 `src/lib/engine.ts`，共用播放器是 `src/components/lab.tsx`。固定程式範例與動畫輸入分離，保護六份教材路由與結果。
- 3D原型與正式GLB整合是不同階段。模型選版、建模、資產搬移、正式整合與部署都需在當前授權範圍內；不覆蓋BLEND／GLB原檔、不盲跑歷史生成腳本。
- 開始工作先核對Git與檔案狀態，不假設已有repository／branch，不自動init、reset、clean、commit、push。多Agent採單一寫入者與可恢復checkpoint。
- 工作目錄依 [WORKTREE_LIFECYCLE](docs/handoff/WORKTREE_LIFECYCLE.md)：公開主repository只有 `~/dev-hub/github/vince115/logic-island` 一處，額外的worktree一律用 `git wt new <名稱> <branch>`（即 `scripts/worktree.sh`）建在 `~/dev-hub/.worktrees/logic-island/<名稱>`，不在主目錄同層建立 `logic-island-*` 資料夾。開工先 `git wt list`，優先重用既有目錄與feature branch，平行任務才另開；同一branch同時只由一個Session修改，標為 `IN USE` 的目錄不進去寫；主目錄有未提交變更時不切換branch；不修改、搬移或清理其他Session的worktree／scratch副本；自己建立且PR已合併的worktree用 `git wt remove` 清理（七項安全檢查全過才移除，不用 `--force`、`rm -rf`），未合併的工作不為整理而刪除，搬移只用 `git wt move`；私有題庫、備份與BLEND原檔放在worktree之外的固定位置。
- 測試依 [TESTING_STATUS](docs/handoff/TESTING_STATUS.md) 執行；區分列出測試、DOM、瀏覽器、模擬手機與真機。可能寫cache／build輸出的檢查，先說明並避免污染既有工作目錄。
- 文件用繁體中文，技術名稱／路徑／指令保持原文；重要結論附證據，不輸出API Key、Token、密碼或其他秘密值。
