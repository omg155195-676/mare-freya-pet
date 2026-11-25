# 角色與美術規格

## 方向
電子雞／虛擬寵物用的 Q 版角色，約 2～3 頭身：大頭、小身體、表情清楚、輪廓簡潔。
不是角色立繪遊戲。正常比例的人物只當作設定參考。

## 小馬蕾（Mare）
- 定位：溫柔 × 撒嬌 × 成熟 × 活潑的陪伴型角色，慢熟，熟了以後會撒嬌，偶爾調皮
- 外觀：黑色長直髮、自然中分、深棕／紅棕色眼睛、人類耳朵、兩側小紅蝴蝶結
- 代表色：櫻花粉・黑・米白
- 固定道具：黑貓抱枕
- 喜歡甜食、旅行、拍照、玩遊戲

## 芙蕾雅（Freya）
- 定位：可靠的大姐姐 × 溫柔 × 有點迷糊 × 情感豐富；被稱讚會害羞；重要時刻很可靠
- 外觀：金色長髮、中央明顯的白色瀏海、橘紅色眼睛、精靈尖耳、兩側編髮丸子頭、白色花朵、紅白緞帶
- 不能變成白髮，不能改成普通的成熟系大姐姐
- 代表色：金色・白色・紅橙
- 固定道具：小黃雞抱枕
- 喜歡美食、旅行、音樂；討厭昆蟲

## 目前的素材
| 類別 | 小馬蕾 | 芙蕾雅 |
|---|---|---|
| 動作 act | idle, walk, eat, play, bath, sleep, happy, angry | 同左 |
| 表情 face | normal, smile, happy, spoiled, surprised, angry, sad, sleepy | normal, smile, happy, spoiled, surprised, confused, shy, sleepy |
| 服裝 wear | daily, home, pajama, travel, sport, formal, special | 同左 |

素材是從角色設定圖（1536×1024）裁切，用 Real-ESRGAN 動漫模型放大 4 倍後去背。
設定圖不在這個 repo 裡；需要重新產生時，把設定圖交給 `tools/hires.py`：

```
python3 -I tools/hires.py <設定圖路徑> <RealESRGAN_x4plus_anime_6B.pth> out/
```

裁切位置寫在 `hires.py` 的 `spec`，對應設定圖上「表情集」「動作Q版」「服裝設計」三排。

## 命名規則
`{角色}_{類別}_{名稱}.webp`，例如 `mare_act_idle.webp`、`freya_face_shy.webp`。
角色：`mare`、`freya`；類別：`act`、`face`、`wear`；背景：`assets/backgrounds/bg_*.jpg`。

## 動畫
每個動作一張圖，動畫用程式做：
- 待機：左右輕晃
- 開心：跳兩下
- 難過：低頭晃動
- 睡覺：呼吸起伏 + ZZZ
- 被摸頭：輕微縮放 + 愛心
