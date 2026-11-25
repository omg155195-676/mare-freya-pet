# 從設定圖裁切角色 → Real-ESRGAN 動漫模型放大 4 倍 → 高解析度去背 → 透明 PNG
import sys, os
import numpy as np, torch
from PIL import Image
from scipy import ndimage
from spandrel import ModelLoader

src, model_path, out = sys.argv[1:4]
im = Image.open(src).convert('RGB')
model = ModelLoader().load_from_file(model_path).model.eval()

EXP = (430, 534, 56); ACT = (570, 672, 56); OUT = (704, 842, 58)
spec = {
 'mare': {
   'face': (EXP, dict(normal=70, smile=162, happy=253, spoiled=343, surprised=436, angry=527, sad=617, sleepy=708)),
   'act':  (ACT, dict(idle=67, walk=148, eat=232, play=312, bath=412, sleep=512, happy=612, angry=706)),
   'wear': (OUT, dict(daily=65, home=163, pajama=265, travel=368, sport=472, formal=580, special=686)),
 },
 'freya': {
   'face': (EXP, dict(normal=832, smile=922, happy=1013, spoiled=1102, surprised=1196, confused=1287, shy=1380, sleepy=1470)),
   'act':  (ACT, dict(idle=832, walk=918, eat=1001, play=1091, bath=1188, sleep=1287, happy=1384, angry=1480)),
   'wear': (OUT, dict(daily=838, home=936, pajama=1038, travel=1144, sport=1250, formal=1358, special=1462)),
 }}

def upscale(img):
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.).permute(2, 0, 1)[None]
    with torch.no_grad(): y = model(x).clamp(0, 1)[0].permute(1, 2, 0).numpy()
    return (y * 255 + .5).astype(np.uint8)

def cutout(rgb):
    a = rgb.astype(np.int16)
    mn, mx = a.min(2), a.max(2)
    bgish = (mn > 205) & (mx - mn < 50)
    lab, n = ndimage.label(bgish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    fg = ~bg
    lab2, n2 = ndimage.label(fg)
    if n2:
        sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
        fg = lab2 == (int(np.argmax(sizes)) + 1)
        fg = ndimage.binary_fill_holes(fg) & (fg | ~bgish)
        fg = ndimage.binary_closing(fg, iterations=1) & (fg | ~bgish)
    alpha = fg.astype(np.float32)
    # 去白邊：外圈 3px 依深淺決定透明度，並把混到的白色背景扣掉
    edge = fg & ~ndimage.binary_erosion(fg, iterations=3)
    dark = np.clip((255 - mn) / 95., 0, 1)
    alpha[edge] = dark[edge]
    alpha = np.where(fg, np.maximum(ndimage.gaussian_filter(alpha, .5), 0) , 0)
    alpha[fg & ~edge] = 1
    af = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.clip((rgb.astype(np.float32) - (1 - af) * 255) / af, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    ys, xs = np.nonzero(alpha > .05)
    return Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')

arr = np.asarray(im).astype(np.int16)
def splits(top, bot, centers):
    band = arr[top:bot]
    ink = ~((band.min(2) > 205) & (band.max(2) - band.min(2) < 50))
    col = ink.sum(0)
    cs = sorted(centers); cut = {}
    for a, b in zip(cs, cs[1:]):
        lo, hi = a + 25, b - 25
        cut[(a, b)] = lo + int(np.argmin(col[lo:hi]))
    res = {}
    for i, c in enumerate(cs):
        l = cut[(cs[i-1], c)] if i > 0 else c - 56
        r = cut[(c, cs[i+1])] if i < len(cs) - 1 else c + 56
        res[c] = (l, r)
    return res

for ch, groups in spec.items():
    for g, ((top, bot, hw), cells) in groups.items():
        d = os.path.join(out, 'characters', ch, g); os.makedirs(d, exist_ok=True)
        sp = splits(top, bot, list(cells.values()))
        for name, cx in cells.items():
            l, r = sp[cx]
            big = upscale(im.crop((l, top, r + 1, bot)))
            spr = cutout(big)
            if spr.height > 384:
                k = 384 / spr.height; spr = spr.resize((round(spr.width * k), 384), Image.LANCZOS)
            spr.save(os.path.join(d, f'{ch}_{g}_{name}.png'), optimize=True)
            print(ch, g, name, (l, r), spr.size, flush=True)
