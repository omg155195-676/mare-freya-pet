# pending/ — Spine 人形（未啟用）

`spine-figure.ts` 是 `Figure` 介面的 Spine 實作，先寫好等授權確認。

- 它**不在建置範圍**（`tsconfig.json` 的 `exclude`），也**沒有任何檔案引用它**。
- `package.json` **沒有** Spine 依賴。
- 它只對 `@esotericsoftware/spine-webgl` 4.3.13 做過型別檢查（套件放在倉庫之外），**從未執行**。裡面的相機擬合、座標換算、視線骨骼、skin 組合都要等實機驗證。

## 啟用條件（全部成立才做）

1. 你持有有效的 Spine Editor 授權（Essential 或 Professional；Trial 不行）。
2. 確認編輯器版本：4.3 → `~4.3.13`；4.2 → `~4.2.120`（4.2 的 API 與此檔不同，需要修改）。
3. 倉庫是私人的。

## 啟用步驟

```powershell
npm install @esotericsoftware/spine-webgl@~4.3.13   # 版本依你的編輯器
```

1. 把 `src/pending/spine-figure.ts` 移到 `src/spine-figure.ts`，並從 `tsconfig.json` 移除 `exclude`。
2. 把測試骨架的匯出檔放到 `public/spine/<名稱>/`（`.skel`、`.atlas`、`.png`；atlas 要勾 premultiply alpha）。這個資料夾已列入 `.gitignore`。
3. 在 `src/main.ts` 改兩行：
   ```ts
   import { createSpineFigure } from './spine-figure';
   const createFigure: FigureFactory = () => createSpineFigure({ path: 'spine/<名稱>/', skeleton: '<名稱>.skel', atlas: '<名稱>.atlas' });
   ```
4. 在倉庫根目錄新增 `THIRD_PARTY_NOTICES.md`，標明 Spine Runtimes 為專有授權。

## 骨架需要配合的命名（之後三位角色共用）

| 用途 | 約定 | 選項 |
|---|---|---|
| 服裝 | skin 名稱以 `outfit/` 開頭 | `outfitPrefix` |
| 永遠穿著的部分（身體、頭髮） | 例：`body/default`、`hair/default` | `baseSkins` |
| 視線 | 一個由 IK 或 transform constraint 追蹤的目標骨骼，例：`look-target` | `lookBone` |
| 眨眼 | 獨立的循環動畫，例：`blink`，疊在 track 1 | `blinkAnimation` |
| 原點 | 根骨骼在兩腳之間的地面 | — |
