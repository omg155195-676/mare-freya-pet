// spike-spine stage: N figures in one transparent window, click-through everywhere else.
// The loop, the hit switching and the drag are deliberately the same shape as Petween's stage
// (cursor events from the host → hit test → set_hit), so what is measured here applies there.
//
// Controls are in the tray menu (the window never takes keyboard focus).

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Figure, FigureFactory } from './figure';
import { createGlFigure } from './gl-figure';

// The one line to change when the Spine figure is enabled (see pending/README.md).
const createFigure: FigureFactory = createGlFigure;
const FIGURE_KIND = 'gl-stand-in';

interface StageInfo { x: number; y: number; w: number; h: number; scale: number }
interface Actor { fig: Figure; x: number; y: number; scale: number; anim: number; skin: number }

const hud = document.getElementById('hud')!;
const actors: Actor[] = [];
let stage: StageInfo = { x: 0, y: 0, w: innerWidth, h: innerHeight, scale: devicePixelRatio || 1 };
let cursor = { x: -1, y: -1 }; // stage CSS px
let hitNow = false;
let drag: { a: Actor; dx: number; dy: number } | null = null;
let fpsCap = 30;
let physics = true;
let showHud = true;

// ---------- figures ----------

const place = (a: Actor) => {
  // feet (bottom-centre of the canvas) at (a.x, a.y)
  a.fig.canvas.style.transform = `translate(${a.x - (a.fig.width * a.scale) / 2}px, ${a.y - a.fig.height * a.scale}px) scale(${a.scale})`;
};
const toLocal = (a: Actor, p: { x: number; y: number }) => ({
  x: (p.x - (a.x - (a.fig.width * a.scale) / 2)) / a.scale,
  y: (p.y - (a.y - a.fig.height * a.scale)) / a.scale,
});

async function setCount(n: number) {
  while (actors.length > n) actors.pop()!.fig.dispose();
  while (actors.length < n) {
    const i = actors.length;
    const fig = await createFigure(i);
    document.body.appendChild(fig.canvas);
    const a: Actor = { fig, x: innerWidth * ((i + 1) / (n + 1)), y: innerHeight - 4, scale: 0.6, anim: 0, skin: i % Math.max(1, fig.skins.length) };
    fig.setPhysics(physics);
    if (fig.skins.length) fig.setSkin(fig.skins[a.skin]);
    actors.push(a);
    place(a);
  }
  actors.forEach((a, i) => {
    a.x = innerWidth * ((i + 1) / (actors.length + 1));
    place(a);
  });
}

// ---------- click-through ----------

function actorAt(p: { x: number; y: number }): Actor | null {
  for (let i = actors.length - 1; i >= 0; i--) {
    const q = toLocal(actors[i], p);
    if (actors[i].fig.hit(q.x, q.y)) return actors[i];
  }
  return null;
}

function updateHit() {
  const hit = drag !== null || actorAt(cursor) !== null;
  if (hit === hitNow) return;
  hitNow = hit;
  void invoke('set_hit', { hit });
}

addEventListener('pointerdown', (e) => {
  const a = actorAt({ x: e.clientX, y: e.clientY });
  if (!a || e.button !== 0) return;
  drag = { a, dx: e.clientX - a.x, dy: e.clientY - a.y };
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.a.x = e.clientX - drag.dx;
  drag.a.y = e.clientY - drag.dy;
  place(drag.a);
});
addEventListener('pointerup', () => {
  drag = null;
  updateHit();
});
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- loop + measurements ----------

const costs: number[] = [];
let frames = 0;
let lastFrame = 0;
let lastHud = 0;
let report = '';

function frame(now: number) {
  requestAnimationFrame(frame);
  if (now - lastFrame < 1000 / fpsCap - 2) return;
  const dt = Math.min(0.1, lastFrame ? (now - lastFrame) / 1000 : 0.016);
  lastFrame = now;

  const t0 = performance.now();
  for (const a of actors) {
    a.fig.lookAt(cursor.x < 0 ? null : toLocal(a, cursor));
    a.fig.frame(dt);
  }
  costs.push(performance.now() - t0);
  frames++;
  updateHit(); // figures move under a still cursor too

  if (now - lastHud >= 1000) {
    const sorted = [...costs].sort((x, y) => x - y);
    const avg = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    report = [
      `figure     ${FIGURE_KIND} × ${actors.length}`,
      `fps        ${((frames * 1000) / (now - lastHud)).toFixed(1)} (cap ${fpsCap})`,
      `frame ms   avg ${avg.toFixed(2)}  p95 ${p95.toFixed(2)}  max ${(sorted.at(-1) ?? 0).toFixed(2)}`,
      `js heap    ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/a'}`,
      `physics    ${physics ? 'on' : 'off'}`,
      `hit        ${hitNow ? 'figure (window takes the mouse)' : 'pass-through'}`,
      `stage      ${stage.w}×${stage.h} physical, scale ${stage.scale}`,
      `CPU / GPU / RAM of the process: read them in Task Manager`,
    ].join('\n');
    hud.textContent = report;
    hud.style.display = showHud ? '' : 'none';
    costs.length = 0;
    frames = 0;
    lastHud = now;
  }
}

// ---------- host events ----------

async function boot() {
  stage = (await invoke<StageInfo | null>('get_stage')) ?? stage;
  await listen<{ x: number; y: number }>('cursor', (e) => {
    // physical desktop px → CSS px inside this window
    cursor = { x: (e.payload.x - stage.x) / stage.scale, y: (e.payload.y - stage.y) / stage.scale };
    updateHit();
  });
  await listen<string>('menu', (e) => {
    const [cmd, arg] = e.payload.split(':');
    if (cmd === 'n') void setCount(Number(arg));
    else if (cmd === 'fps') fpsCap = Number(arg);
    else if (cmd === 'hud') showHud = !showHud;
    else if (cmd === 'physics') {
      physics = !physics;
      actors.forEach((a) => a.fig.setPhysics(physics));
    }
    else if (cmd === 'log') void invoke('log_line', { line: `${new Date().toISOString()} | ${report.replace(/\n/g, ' | ')}` });
    else if (cmd === 'anim')
      actors.forEach((a) => {
        a.anim = (a.anim + 1) % Math.max(1, a.fig.animations.length);
        a.fig.setAnimation(a.fig.animations[a.anim]);
      });
    else if (cmd === 'skin')
      actors.forEach((a) => {
        a.skin = (a.skin + 1) % Math.max(1, a.fig.skins.length);
        a.fig.setSkin(a.fig.skins[a.skin]);
      });
  });
  await setCount(3);
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  hud.textContent = `boot failed: ${e?.stack ?? e}`;
});
