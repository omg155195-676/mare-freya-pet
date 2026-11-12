# Fantasy Trio × Petween — Phase 2 工作區

三位原創角色（小馬蕾、芙芙、芙蕾雅）的 Windows 桌面生活系統，以 [Petween](https://github.com/Traveritas/petween) 為基礎。僅供個人使用，不公開散布。

這個資料夾**不包含 Petween 的程式碼，也沒有修改 Petween**；也**不包含 Spine runtime**。

| 資料夾 | 內容 | 狀態 |
|---|---|---|
| `plugin/fantasy-trio/` | Petween 第三方外掛：三人顯示/隱藏、自主走動、轉身、避讓、拖曳後恢復、點擊與滑鼠停留台詞。只用 Petween 公開外掛 API（apiVersion 1） | 邏輯有自動測試；**未在 Petween 實機執行過** |
| `packs/xiaomalei` `fufu` `freya` | 三個寵物包。圖是**完整比例的佔位人形**（不是角色美術、不是 Q 版）；台詞與行為參數在各自的 `pet.json` | 已通過 Petween 的寵物包檢查；**未在實機顯示過** |
| `spike-spine/` | 獨立技術原型：透明、穿透的 Tauri 2 視窗 + WebGL 人形替身。Spine 版本的程式放在 `src/pending/`，**未啟用** | 前端在無頭 Chromium 跑過；**Rust 端未編譯過、未在 WebView2 跑過** |
| `tools/` | 佔位圖產生器、Windows 安裝腳本 | 安裝腳本**未執行過** |
| `tests/` | `node --test` 測試（不需安裝任何套件） | 24 項通過 |
| `docs/` | 測試紀錄、授權整理 | — |

## 在 Windows 上安裝到 Petween（Phase 2A）

前提：已能執行 Petween（`npm run tauri dev` 或安裝版），並至少啟動過一次。

1. 先**結束 Petween**（系統匣 → 退出）。
2. 在這個資料夾執行（PowerShell）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\install.ps1
   ```
   或手動複製：
   - `plugin\fantasy-trio` → `%APPDATA%\com.petween.app\plugins\fantasy-trio`
   - `packs\xiaomalei`、`packs\fufu`、`packs\freya` → `%APPDATA%\com.petween.app\pets\`
3. 啟動 Petween。三位佔位角色會出現在主螢幕下緣；原本的「團子」不會被動到（不想看到可在 設定 → 寵物 送走）。
4. 設定 → 插件 → Fantasy Trio → 設定：三個「顯示」開關、自由走動、走路速度、偶爾說話。系統匣也有三個「顯示 ○○」項目。

測試步驟與回報表格在 [`docs/TEST-RECORD.md`](docs/TEST-RECORD.md)。

## 開發

```bash
node --test "tests/*.test.mjs"        # 外掛測試
python3 tools/make_placeholders.py    # 重新產生佔位圖（需要 Pillow）
```

台詞與行為參數直接改 `packs/<角色>/pet.json` 的 `plugins["fantasy-trio"]`，不需要改程式。

## 授權

- 本資料夾的程式為 Fantasy Trio 專案自有；`spike-spine/` 的視窗與穿透做法參照 Petween（AGPL-3.0-or-later），標示為 AGPL-3.0-or-later。
- Petween：AGPL-3.0-or-later，著作權屬原作者 Traveritas。
- Spine Runtimes：**專有授權**（Spine Runtimes License Agreement），不是開源授權；目前不是本專案的依賴。詳見 [`docs/LICENSES.md`](docs/LICENSES.md)。
