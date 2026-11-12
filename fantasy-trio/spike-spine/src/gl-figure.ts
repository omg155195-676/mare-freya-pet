// A WebGL stand-in for a character: no Spine, no assets. It exists so the parts of the prototype that
// do not depend on Spine can be measured first — WebGL with premultiplied alpha in a transparent
// WebView2 window, click-through around a figure, several instances, frame cost — and so the stage is
// ready the day the Spine figure is switched on (see pending/README.md).

import type { Box, Figure } from './figure';

const W = 360;
const H = 700;
const GROUND = 680;

const VS = `
attribute vec2 p; attribute vec4 c; varying vec4 v; uniform vec2 size;
void main() { v = c; gl_Position = vec4(p.x / size.x * 2.0 - 1.0, 1.0 - p.y / size.y * 2.0, 0.0, 1.0); }`;
const FS = `precision mediump float; varying vec4 v; void main() { gl_FragColor = v; }`;

type RGBA = [number, number, number, number];
const SKINS: Record<string, { body: RGBA; far: RGBA; hair: RGBA }> = {
  'outfit/a': { body: [0.36, 0.4, 0.55, 1], far: [0.27, 0.3, 0.42, 1], hair: [0.95, 0.8, 0.45, 0.55] },
  'outfit/b': { body: [0.62, 0.34, 0.42, 1], far: [0.46, 0.25, 0.32, 1], hair: [0.75, 0.72, 0.9, 0.55] },
};

export async function createGlFigure(index: number): Promise<Figure> {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'figure';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  // Premultiplied alpha is what the compositor of a transparent window expects, and what Spine's
  // WebGL renderer is normally fed (atlases exported with "premultiply alpha").
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })!;
  if (!gl) throw new Error('WebGL is not available in this webview');

  const prog = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const aP = gl.getAttribLocation(prog, 'p');
  const aC = gl.getAttribLocation(prog, 'c');
  gl.enableVertexAttribArray(aP);
  gl.enableVertexAttribArray(aC);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 24, 8);
  gl.uniform2f(gl.getUniformLocation(prog, 'size'), W, H);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
  gl.viewport(0, 0, canvas.width, canvas.height);

  let verts: number[] = [];
  let box: Box = { x: 0, y: 0, w: 0, h: 0 };
  let lo = [Infinity, Infinity];
  let hi = [-Infinity, -Infinity];

  const vert = (x: number, y: number, c: RGBA) => {
    verts.push(x, y, c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]);
    if (x < lo[0]) lo[0] = x;
    if (y < lo[1]) lo[1] = y;
    if (x > hi[0]) hi[0] = x;
    if (y > hi[1]) hi[1] = y;
  };
  const disc = (x: number, y: number, r: number, c: RGBA, n = 20) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      vert(x, y, c);
      vert(x + Math.cos(a) * r, y + Math.sin(a) * r, c);
      vert(x + Math.cos(b) * r, y + Math.sin(b) * r, c);
    }
  };
  const limb = (a: [number, number], b: [number, number], w: number, c: RGBA) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (w / 2);
    const ny = (dx / l) * (w / 2);
    const q: [number, number][] = [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]];
    for (const i of [0, 1, 2, 0, 2, 3]) vert(q[i][0], q[i][1], c);
    disc(a[0], a[1], w / 2, c, 12);
    disc(b[0], b[1], w / 2, c, 12);
  };
  const polar = (p: [number, number], len: number, deg: number): [number, number] => {
    const r = (deg * Math.PI) / 180;
    return [p[0] + len * Math.sin(r), p[1] + len * Math.cos(r)];
  };

  const animations = ['idle', 'walk', 'wave'];
  const skins = Object.keys(SKINS);
  let anim = 'idle';
  let skin = skins[index % skins.length];
  let physics = true;
  let look: { x: number; y: number } | null = null;
  let t = index * 0.37; // instances are out of phase, like independent characters
  // one damped spring for the "hair" strand: stands in for a physics constraint
  let hairA = 0;
  let hairV = 0;
  let lastSway = 0;

  const figure: Figure = {
    canvas,
    width: W,
    height: H,
    animations,
    skins,
    setAnimation: (n) => void (anim = animations.includes(n) ? n : anim),
    setSkin: (n) => void (skin = SKINS[n] ? n : skin),
    setPhysics: (on) => void (physics = on),
    lookAt: (p) => void (look = p),

    frame(dt) {
      t += dt;
      const s = SKINS[skin];
      verts = [];
      lo = [Infinity, Infinity];
      hi = [-Infinity, -Infinity];

      const walk = anim === 'walk';
      const ph = t * 5.2;
      const sway = walk ? Math.sin(ph) * 5 : Math.sin(t * 1.3) * 2;
      const breathe = Math.sin(t * 1.8) * 2;
      const cx = W / 2 + sway;
      const hipY = GROUND - 280 + (walk ? Math.abs(Math.cos(ph)) * -5 : 0);
      const shY = hipY - 170 - breathe;
      const hip: [number, number] = [cx, hipY];

      // hair spring, driven by how the body moves
      const accel = (sway - lastSway) / Math.max(dt, 1e-3);
      lastSway = sway;
      if (physics) {
        hairV += (-hairA * 60 - hairV * 6 - accel * 0.6) * dt;
        hairA += hairV * dt;
      } else hairA = hairV = 0;

      const lookX = look ? Math.max(-1, Math.min(1, (look.x - cx) / 400)) : 0;
      const lookY = look ? Math.max(-1, Math.min(1, (look.y - (shY - 50)) / 400)) : 0;
      const head: [number, number] = [cx + lookX * 7, shY - 52 + lookY * 5];

      // back hair (translucent: shows whether blending against the desktop is right)
      limb([head[0] - 6, head[1]], polar([head[0] - 6, head[1]], 230, -6 + hairA), 46, s.hair);

      for (const [side, color] of [[-1, s.far], [1, s.body]] as const) {
        const th = walk ? 24 * Math.sin(ph + (side > 0 ? 0 : Math.PI)) : 3 * side;
        const knee = polar([hip[0] + side * 20, hip[1]], 135, th);
        const foot = polar(knee, 135, walk ? th - 30 * Math.max(0, Math.cos(ph + (side > 0 ? 0 : Math.PI))) : 2 * side);
        limb([hip[0] + side * 20, hip[1]], knee, 32, color);
        limb(knee, foot, 28, color);
      }
      limb([cx, shY + 10], [cx, hipY], 86, s.body);
      for (const side of [-1, 1] as const) {
        const sh: [number, number] = [cx + side * 52, shY + 10];
        const waving = anim === 'wave' && side > 0;
        const up = waving ? 150 : (walk ? -18 * Math.sin(ph + (side > 0 ? 0 : Math.PI)) : 0) + 8 * side;
        const el = polar(sh, 88, up);
        const hand = polar(el, 84, waving ? 190 + Math.sin(t * 9) * 24 : up - 4 * side);
        limb(sh, el, 24, s.body);
        limb(el, hand, 20, s.body);
      }
      limb([cx, shY], [head[0], head[1] + 20], 20, s.far);
      disc(head[0], head[1], 34, s.body, 28);
      // eyes follow the cursor: stands in for gaze control
      for (const e of [-1, 1]) disc(head[0] + e * 12 + lookX * 5, head[1] - 2 + lookY * 4, 4, [1, 1, 1, 1], 10);
      // front hair strand, also translucent, over the face
      limb([head[0] + 20, head[1] - 22], polar([head[0] + 20, head[1] - 22], 150, 4 + hairA * 1.4), 22, s.hair);

      box = { x: lo[0], y: lo[1], w: hi[0] - lo[0], h: hi[1] - lo[1] };
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 6);
    },

    bounds: () => box,
    // Step 1 (agreed): the box is the hit area. A per-pixel test comes later.
    hit: (x, y) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h,

    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
  figure.frame(0);
  return figure;
}
