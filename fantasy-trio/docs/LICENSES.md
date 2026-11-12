# 授權整理（Phase 2）

> 工程整理，不是法律意見。條文以官方頁面為準。最後查核：2026-11-12。

## 目前實際用到的

| 元件 | 授權 | 用在哪 | 備註 |
|---|---|---|---|
| Petween | AGPL-3.0-or-later（Traveritas） | 執行環境；本資料夾不含其程式碼 | 個人使用不觸發散布義務 |
| `@tauri-apps/api`、`@tauri-apps/cli`、`tauri`（Rust） | MIT / Apache-2.0 | `spike-spine/` | — |
| Vite、TypeScript | MIT、Apache-2.0 | `spike-spine/` 開發工具 | — |
| `serde`、`windows-sys` | MIT / Apache-2.0 | `spike-spine/src-tauri` | — |
| 文泉驛正黑（產生佔位圖名牌時使用） | GPL-2.0（附字型嵌入例外） | 只用於產生圖片，字型檔不在倉庫內 | — |

## 尚未加入、等待授權確認的

| 元件 | 授權 | 狀態 |
|---|---|---|
| `@esotericsoftware/spine-core`、`@esotericsoftware/spine-webgl` | **Spine Runtimes License Agreement（專有，2025-04-05 版）**。npm 的 license 欄位是 `LicenseRef-LICENSE`。**不是 MIT、不是 AGPL、不是任何開源授權** | **不是依賴。** `spike-spine/package.json` 沒有列入；`src/pending/spine-figure.ts` 不在建置範圍、沒有被任何檔案引用 |
| Spine 官方範例資產 | 各範例資料夾有自己的授權檔 | **未下載、未放入倉庫。** 使用前逐一閱讀該範例的授權檔 |

### 啟用 Spine 之前必須成立的條件

1. 使用者本人持有有效的 **Spine Editor 授權**（Essential 或 Professional；**Trial 不授予 runtime 的整合與使用權**）。臉部網格需要 Professional。
2. 確認編輯器版本（4.2 或 4.3）；runtime 鎖定同一個 major.minor（`~4.3.x` 或 `~4.2.x`）。
3. 倉庫維持私人。Spine runtime 透過 npm 安裝，不把原始碼複製進倉庫。
4. 官方範例資產：官方倉庫說明「可免費評估 runtime 與範例」；每個範例另有授權檔（圖像通常限非商業用途、轉散布需附授權檔）。**這一點我只查到概述，未逐一核對每個範例的授權檔**，使用哪個範例就先讀哪個。範例只放在本機 `spike-spine/public/spine/`（已列入 `.gitignore`），不提交。

### 之後若要分享或散布

必須重新審查，至少包含：收到的人是否各自持有 Spine 授權、AGPL「不得附加額外限制」與專有 runtime 的衝突、是否需要 Petween 著作權人的例外許可、角色素材的授權。

## 來源

- Spine Runtimes License Agreement：https://esotericsoftware.com/spine-runtimes-license
- Spine Editor License Agreement：https://esotericsoftware.com/spine-editor-license
- Spine 購買頁：https://esotericsoftware.com/spine-purchase
- Spine 版本規則：https://esotericsoftware.com/spine-versioning
- spine-runtimes 倉庫：https://github.com/EsotericSoftware/spine-runtimes
