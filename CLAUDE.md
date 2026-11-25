# 小馬蕾 × 芙蕾雅 電子雞

雙角色電子雞（虛擬寵物）網頁遊戲，以 PWA 形式發佈在 GitHub Pages：
https://omg155195-676.github.io/mare-freya-pet/

## 檔案結構

- `index.html`：整個遊戲（HTML + CSS + JS 寫在同一個檔案，沒有建置步驟）
- `sw.js`：離線快取。**任何檔案改動後都要把 `VERSION` 加一**（例如 `mf-pet-v3` → `mf-pet-v4`），新增的素材也要加進 `CORE` 清單
- `manifest.webmanifest`、`icons/`：PWA 安裝設定與 App 圖示
- `assets/characters/{mare|freya}/{act|face|wear}/*.webp`：角色圖（透明背景，高 340～384px，遊戲中縮小到約 120 邏輯像素）
- `assets/backgrounds/bg_room.jpg`：房間背景（1536×1024，遊戲畫布 480×320）
- `tools/hires.py`：從角色設定圖裁切角色 → Real-ESRGAN 動漫模型放大 4 倍 → 去背
- `docs/design-spec.md`：角色與美術規格

## 遊戲程式重點（index.html）

- 畫布邏輯尺寸 `W=480, H=320`；房間內的位置在 `SPOTS`，可走動範圍在 `FLOOR`
- 角色圖載入在 `REF_LIST`；狀態對應到哪張圖在 `refPick()`，表情對應在 `FACE_MAP`
- 動畫是程式做的（彈跳、搖晃、縮放、呼吸），參數在 `animState()`；每個動作只用一張圖
- 角色行為：`Pet` 類別的 `update()`、自主行為 `think()`、雙人互動 `DUO` / `startDuo()`
- 數值：`tick()` 隨時間下降，`eff()` 套用變化；存檔在 `localStorage`（key `mare-freya-pet-v1`）
- 沒有專用圖的狀態（喝水、生病、看電視、被摸頭）用最接近的表情圖＋小道具

## 原則

- 角色外觀以使用者提供的設定圖為準，不重新設計角色
- 優先：可愛 > 華麗、辨識度 > 細節、程式動畫 > 增加大量圖片
- 介面文字使用繁體中文
- 修改時只改需要的部分，不要整個重寫

## 本機測試

```
python3 -m http.server 8765
```
打開 http://localhost:8765/ 。Service Worker 需要用 http 伺服器測，直接開檔案不會啟用離線快取。
