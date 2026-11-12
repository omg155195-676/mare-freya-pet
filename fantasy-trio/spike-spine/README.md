# spike-spine — 獨立技術原型

問題：**Spine 骨架能不能在 Petween 那種「透明、置頂、可穿透」的 Tauri 2 + WebView2 視窗裡正常運作？**

這是一個冷凍保存的獨立小程式（比照 Petween 自己的 `spike/`），不是 Petween 的一部分，也不會併入正式程式。視窗旗標、不搶焦點、游標輪詢與穿透切換都照 Petween 舞台的做法（`petween/src-tauri/src/stages.rs`），所以這裡量到的結果可以套用到 Petween。

## 現況

| 部分 | 狀態 |
|---|---|
| Rust 宿主（`src-tauri/`） | 已寫好，**從未編譯過**（撰寫環境是 Linux，沒有 Windows 工具鏈） |
| 舞台（`src/main.ts`） | 型別檢查與 `vite build` 通過；在無頭 Chromium 用模擬的 Tauri 橋接跑過（繪製、命中切換、拖曳、選單事件正常） |
| WebGL 替身人形（`src/gl-figure.ts`） | 同上。**不是 Spine**，只用來先量與 Spine 無關的部分 |
| Spine 人形（`src/pending/spine-figure.ts`） | **未啟用、未執行**；只對 spine-webgl 4.3.13 做過型別檢查。見 [`src/pending/README.md`](src/pending/README.md) |

**Spine runtime 目前不是這個專案的依賴。**

## 執行（Windows）

需要 Node.js ≥ 20、Rust stable、WebView2（Windows 11 內建）。

```powershell
cd spike-spine
npm install
npm run tauri dev
```

- 視窗不會拿鍵盤焦點，所有操作都在**系統匣圖示的選單**：人形數量（1/3/6）、幀率上限（15/30/60）、下一個動畫、下一套服裝、物理開關、HUD 開關、把目前量測寫入 `spike-spine.log`、Quit。
- 左上角 HUD 顯示：實際 fps、每幀耗時（平均 / p95 / 最大）、JS 記憶體、目前是「命中人形」還是「穿透」。
- CPU、GPU、記憶體請看**工作管理員**（程序名稱 `spike-spine` 以及它底下的 `msedgewebview2`）。

## 測試順序

第一輪用 WebGL 替身（現在就能做，不需要 Spine）：

| # | 項目 | 怎麼看 |
|---|---|---|
| A1 | 透明背景 | 人形以外看得到桌面；半透明的「頭髮」條與桌面混色正常，邊緣沒有黑邊或白邊 |
| A2 | 滑鼠穿透 | 人形外可以正常點桌面圖示和其他視窗；HUD 的 `hit` 在游標進出人形時切換 |
| A3 | 不搶焦點 | 在記事本打字時點人形、拖人形，記事本仍然可以繼續打字 |
| A4 | 拖曳 | 按住人形可拖動；放開後穿透恢復 |
| A5 | 多個實例 | 選單切 1 / 3 / 6，都能顯示；記下各自的 fps 與每幀耗時 |
| A6 | 效能基準 | 3 個、30fps，靜置 1 分鐘，記錄工作管理員的 CPU / GPU / 記憶體；再試 15fps 與 60fps |

第二輪啟用 Spine 後（條件見 `src/pending/README.md`），依確認過的順序：

1. Tauri 2 + WebView2 載入 atlas / skel / png
2. 全身動畫（站、走、轉身、坐）與動畫之間的混合
3. 臉部網格、眨眼、表情、視線跟隨游標
4. Skins 換裝（執行中切換，姿勢不重置）
5. 長髮與服裝物理（走、被拖著甩、視窗失焦後不暴衝）
6. 三個獨立骨架實例
7. 透明背景與穿透（命中先用骨架包圍盒）
8. 效能與記憶體（與第一輪 A6 的替身基準比較）

待比較的做法：
- **A. 每個人形一個 WebGL context**（目前的做法）對比 **B. 每個舞台共用一個 context**：看 context 數量上限、貼圖是否重複佔用 GPU 記憶體、效能。
- 動畫切換：Spine 自己的骨骼混合（mix）對比影像交叉淡化，哪個不跳。

## 已知限制

- 只開主螢幕一個視窗；副螢幕測試不在這一輪。
- 命中檢測是包圍盒：人形框內的空隙（手臂與身體之間）目前**點不到桌面**，這是第一步的預期行為，之後再改善。
- HUD 的 JS 記憶體只是 JavaScript 堆積，不含 GPU 貼圖。
