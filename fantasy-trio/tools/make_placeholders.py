#!/usr/bin/env python3
"""Full-proportion placeholder figures for the Fantasy Trio packs (Phase 2A).

These are neutral mannequins (about 7.5 heads tall), NOT the characters' designs: they only stand in
until the Spine skeletons exist. Each pack gets the same poses in its own tint, with the name on a tag.

Usage:  python3 tools/make_placeholders.py            (run from fantasy-trio/)
Needs:  Pillow, and a CJK font for the name tag (falls back to Latin initials).
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

SS = 3  # supersampling
W, H = 320, 640  # one frame
GROUND = 612  # feet rest here -> anchor y = GROUND / H
HEAD_R = 31

CHARACTERS = {
    "xiaomalei": {"name": "小馬蕾", "latin": "XM", "body": (86, 92, 110), "far": (62, 67, 82), "tag": (40, 40, 48)},
    "fufu": {"name": "芙芙", "latin": "FF", "body": (168, 160, 190), "far": (132, 125, 152), "tag": (128, 32, 62)},
    "freya": {"name": "芙蕾雅", "latin": "FR", "body": (214, 176, 96), "far": (176, 142, 72), "tag": (196, 92, 44)},
}

FONT_PATHS = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "C:/Windows/Fonts/msjh.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def font(size):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size), True
    return ImageFont.load_default(), False


def polar(p, length, deg):
    """Point `length` away from p; 0 deg = straight down, positive = towards +x (the facing side)."""
    a = math.radians(deg)
    return (p[0] + length * math.sin(a), p[1] + length * math.cos(a))


class Fig:
    def __init__(self, ch):
        self.ch = ch
        self.im = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def limb(self, a, b, width, color):
        d, s = self.d, SS
        d.line([(a[0] * s, a[1] * s), (b[0] * s, b[1] * s)], fill=color, width=int(width * s))
        for p in (a, b):
            r = width / 2
            d.ellipse([(p[0] - r) * s, (p[1] - r) * s, (p[0] + r) * s, (p[1] + r) * s], fill=color)

    def poly(self, pts, color):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=color)

    def circle(self, c, r, color):
        s = SS
        self.d.ellipse([(c[0] - r) * s, (c[1] - r) * s, (c[0] + r) * s, (c[1] + r) * s], fill=color)

    def tag(self, c):
        f, cjk = font(15 * SS)
        text = self.ch["name"] if cjk else self.ch["latin"]
        box = self.d.textbbox((0, 0), text, font=f)
        tw, th = box[2] - box[0], box[3] - box[1]
        x, y = c[0] * SS - tw / 2, c[1] * SS - th / 2
        pad = 5 * SS
        self.d.rounded_rectangle([x - pad, y - pad, x + tw + pad, y + th + pad + 2 * SS], radius=6 * SS, fill=self.ch["tag"])
        self.d.text((x, y - box[1]), text, font=f, fill=(255, 255, 255, 255))

    def done(self):
        return self.im.resize((W, H), Image.LANCZOS)


def front(ch, arms=((8, 6), (-8, -6)), sway=0.0, squash=1.0, hip_y=None, leg=((3, 2), (-3, -2)), head_tilt=0.0, tag=True):
    """Front view. arms / leg = ((upper, lower) for the figure's left, right) in degrees from straight down."""
    f = Fig(ch)
    body, far = ch["body"], ch["far"]
    cx = W / 2 + sway
    hip = hip_y if hip_y is not None else GROUND - 262
    sh_y = hip - 162 * squash
    # legs
    for side, (th, sn) in zip((1, -1), leg):
        h = (cx + side * 19, hip)
        k = polar(h, 126, th)
        a = polar(k, 124, sn)
        f.limb(h, k, 30, body)
        f.limb(k, a, 26, body)
        f.limb(a, (a[0] + side * 9, a[1] + 6), 20, far)
    # torso
    f.poly([(cx - 46, sh_y), (cx + 46, sh_y), (cx + 31, hip - 62), (cx + 40, hip + 8), (cx - 40, hip + 8), (cx - 31, hip - 62)], body)
    f.circle((cx - 46, sh_y + 6), 14, body)
    f.circle((cx + 46, sh_y + 6), 14, body)
    # arms
    for side, (up, lo) in zip((1, -1), arms):
        s = (cx + side * 50, sh_y + 8)
        e = polar(s, 84, up)
        hnd = polar(e, 80, lo)
        f.limb(s, e, 22, body)
        f.limb(e, hnd, 19, body)
        f.circle(hnd, 12, far)
    # neck + head
    f.limb((cx, sh_y - 2), (cx, sh_y - 22), 18, far)
    hc = (cx + head_tilt, sh_y - 22 - HEAD_R + 4)
    f.circle(hc, HEAD_R, body)
    if tag:
        f.tag((cx, sh_y + 44))
    return f.done()


def side(ch, phase=None, thigh=(0, 0), shin=(0, 0), arm=(0, 0), fore=(0, 0), lean=0.0, hip_y=None, head_drop=0.0, tag=True):
    """Side view facing +x (right). Tuples are (near limb, far limb) angles in degrees."""
    f = Fig(ch)
    body, far = ch["body"], ch["far"]
    cx = W / 2 - (40 if hip_y is not None else 0)  # seated: legs reach forward, so sit further back
    hip = (cx, hip_y if hip_y is not None else GROUND - 262)
    sh = polar(hip, -160, -lean)  # shoulder above the hip, leaning forward by `lean`

    def leg(i, color):
        k = polar(hip, 126, thigh[i])
        a = polar(k, 124, shin[i])
        toe = (a[0] + 22, a[1] + 5)
        return k, a, toe, color

    legs = [leg(1, far), leg(0, body)]
    lowest = max(max(a[1], t[1]) for _, a, t, _ in legs) + 11
    dy = GROUND - lowest if phase is not None else 0  # walking: keep the lower foot on the ground
    sh = (sh[0], sh[1] + dy)
    hp = (hip[0], hip[1] + dy)

    def draw_leg(k, a, toe, color):
        k, a, toe = (k[0], k[1] + dy), (a[0], a[1] + dy), (toe[0], toe[1] + dy)
        f.limb(hp, k, 30, color)
        f.limb(k, a, 26, color)
        f.limb(a, toe, 20, color)

    def draw_arm(i, color):
        e = polar(sh, 84, arm[i])
        hnd = polar(e, 80, fore[i])
        f.limb((sh[0], sh[1] + 8), e, 22, color)
        f.limb(e, hnd, 19, color)
        f.circle(hnd, 12, far if color == body else body)

    draw_arm(1, far)
    draw_leg(*legs[0])
    # torso
    f.limb((sh[0], sh[1] + 14), (hp[0], hp[1] - 4), 54, body)
    draw_leg(*legs[1])
    # neck + head with a nose towards the facing side
    nk = polar(sh, -22, -lean)
    f.limb(sh, nk, 18, far)
    hc = (nk[0] + 4 + head_drop * 0.6, nk[1] - HEAD_R + 6 + head_drop)
    f.circle(hc, HEAD_R, body)
    f.poly([(hc[0] + HEAD_R - 4, hc[1] - 4), (hc[0] + HEAD_R + 9, hc[1] + 6), (hc[0] + HEAD_R - 5, hc[1] + 12)], body)
    if tag:
        f.tag((sh[0], sh[1] + 52))
    draw_arm(0, body)
    return f.done()


def walk_frames(ch, n=8):
    frames = []
    for i in range(n):
        p = 2 * math.pi * i / n
        th = (26 * math.sin(p), 26 * math.sin(p + math.pi))
        # the leg swinging forward bends at the knee
        sn = tuple(t - 38 * max(0.0, math.cos(pp)) for t, pp in zip(th, (p, p + math.pi)))
        arm = (-20 * math.sin(p), -20 * math.sin(p + math.pi))
        fore = tuple(a + 16 for a in arm)
        frames.append(side(ch, phase=p, thigh=th, shin=sn, arm=arm, fore=fore, lean=4, tag=False))
    return frames


def wave_frames(ch, n=6):
    out = []
    for i in range(n):
        w = 22 * math.sin(2 * math.pi * i / n)
        out.append(front(ch, arms=((150, 190 + w), (-8, -6))))
    return out


def sheet(frames):
    im = Image.new("RGBA", (W * len(frames), H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.paste(f, (i * W, 0))
    return im


def narrow(im, k):
    """A 3/4 view for the turn: the front view squeezed horizontally."""
    small = im.resize((int(W * k), H), Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(small, ((W - small.width) // 2, 0))
    return out


def build(pack_id, root):
    ch = CHARACTERS[pack_id]
    out = os.path.join(root, "packs", pack_id, "clips")
    os.makedirs(out, exist_ok=True)
    clips = {
        "idle": front(ch),
        "walk": sheet(walk_frames(ch)),
        "turn": narrow(front(ch, tag=False), 0.66),
        "wave": sheet(wave_frames(ch)),
        "happy": front(ch, arms=((152, 168), (-152, -168))),
        "dragged": front(ch, arms=((165, 178), (-165, -178)), leg=((7, -9), (-7, 9)), head_tilt=5),
        "think": front(ch, arms=((30, 150), (-10, -40)), head_tilt=-5),
        "oops": front(ch, arms=((34, 152), (-34, -152)), head_tilt=0, squash=0.97),
        "sit": side(ch, thigh=(138, 132), shin=(15, 12), arm=(40, 36), fore=(95, 90), lean=5, hip_y=GROUND - 27, tag=False),
        "sleep": side(ch, thigh=(138, 132), shin=(15, 12), arm=(34, 30), fore=(88, 84), lean=20, hip_y=GROUND - 27, head_drop=12, tag=False),
    }
    for name, im in clips.items():
        im.save(os.path.join(out, f"{name}.webp"), "WEBP", lossless=True, method=6)
    return sorted(clips)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for cid in CHARACTERS:
        print(cid, build(cid, root))
