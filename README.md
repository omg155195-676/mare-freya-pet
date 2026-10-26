# 小馬蕾 × 芙蕾雅（離線版）

雙角色電子雞的 PWA 版本。第一次連網打開後，可以「加入主畫面」，之後不用網路也能玩。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 遊戲本體 |
| `manifest.webmanifest` | App 名稱、圖示、全螢幕設定 |
| `sw.js` | 離線快取 |
| `icons/` | App 圖示 |
| `.nojekyll` | 讓 GitHub Pages 原樣提供檔案 |

## 開啟 GitHub Pages

1. 把這個資料夾裡的所有檔案放到 repo 的根目錄（`main` 分支）。
2. 到 repo 的 **Settings → Pages**。
3. **Source** 選 `Deploy from a branch`，Branch 選 `main`，資料夾選 `/ (root)`，按 **Save**。
4. 等 1～2 分鐘，網址會是 `https://<帳號>.github.io/<repo 名稱>/`。

## 安裝到手機

- **iPhone（Safari）**：打開網址 → 分享按鈕 → 「加入主畫面」。
- **Android（Chrome）**：打開網址 → 右上角選單 → 「安裝應用程式」或「加到主畫面」。

安裝完先在有網路的情況下打開一次，之後就能離線玩。

## 更新遊戲

改完 `index.html` 後，把 `sw.js` 第一行的 `VERSION` 改成新的版本號（例如 `mf-pet-v2`）再上傳。手機下次連網打開時就會換成新版。

## 存檔

進度存在手機瀏覽器裡，不會和 claude.ai 版本同步。清除 Safari／Chrome 的網站資料會讓存檔消失。
