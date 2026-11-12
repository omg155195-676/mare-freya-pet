// Drives plugin/fantasy-trio/main.js against a small stand-in for Petween's plugin API.
// The stand-in copies the documented channel rules (docs/02): exclusive stacks, preemption, and
// "a released active position lease leaves its value as the base". It is NOT Petween: passing here
// shows the plugin's wiring is consistent with the API as documented, not that it works in the app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import plugin from '../plugin/fantasy-trio/main.js';

let clock = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
}

class Stack {
  constructor(base, defaultPreempt = false) {
    this.base = base;
    this.defaultPreempt = defaultPreempt;
    this.stack = [];
    this.seq = 0;
  }
  get value() {
    return this.stack.length ? this.stack[0].value : this.base;
  }
  request(req, owner) {
    const ch = this;
    const lease = {
      owner, priority: req.priority, value: req.value, releaseOn: req.releaseOn ?? 'never', order: ++this.seq,
      active: false, revoked: false, revokedFns: [],
      update(v) { if (!this.revoked) this.value = v; },
      release() { ch.remove(this, false); },
      dispose() { this.release(); },
      onRevoked(fn) { this.revokedFns.push(fn); return { dispose() {} }; },
      onActiveChange() { return { dispose() {} }; },
    };
    if (req.preempt ?? this.defaultPreempt) for (const l of [...this.stack]) if (l.priority <= req.priority) this.remove(l, true);
    this.stack.push(lease);
    this.stack.sort((a, b) => b.priority - a.priority || a.order - b.order);
    this.refresh();
    return lease;
  }
  remove(l, revoke) {
    const i = this.stack.indexOf(l);
    if (i < 0) return;
    this.stack.splice(i, 1);
    l.revoked = true;
    const was = l.active;
    l.active = false;
    if (revoke) l.revokedFns.forEach((f) => f());
    this.onRemoved?.(l, was);
    this.refresh();
  }
  refresh() {
    this.stack.forEach((l, i) => (l.active = i === 0));
  }
  setBase(v) {
    const moved = v !== this.base;
    this.base = v;
    if (moved) for (const l of [...this.stack]) if (l.releaseOn === 'signal-change') this.remove(l, false);
  }
  entries() {
    return this.stack.map((l) => ({ owner: l.owner, priority: l.priority, value: l.value, active: l.active }));
  }
}

function makeWorld({ installed = ['xiaomalei', 'fufu', 'freya'], settings = {}, instances = [] } = {}) {
  const packs = Object.fromEntries(installed.map((id) => [id, JSON.parse(readFileSync(new URL(`../packs/${id}/pet.json`, import.meta.url), 'utf8'))]));
  packs.default = { id: 'default', plugins: {} };
  const pets = [];
  const timers = [];
  const frames = new Set();
  const listeners = { added: [], removed: [] };
  const store = (init = {}) => {
    const m = new Map(Object.entries(init));
    const fns = [];
    return {
      get: (k, fb) => (m.has(k) ? m.get(k) : fb),
      set: (k, v) => { m.set(k, v); fns.forEach((f) => f(k)); },
      delete: (k) => m.delete(k),
      all: () => Object.fromEntries(m),
      onChange: (f) => { fns.push(f); return { dispose() {} }; },
    };
  };
  const log = [];
  const tray = [];
  let n = 0;

  function makePet(packId, position, scale = 1, id = `pet-${++n}`) {
    const state = new Stack('idle');
    const pos = new Stack(position, true);
    pos.onRemoved = (l, was) => { if (was) pos.base = l.value; };
    const said = [];
    const motions = new Set();
    const inputFns = [];
    const pet = {
      id, scale, packId, said, motions, state, pos,
      input: (e) => inputFns.forEach((f) => f({ x: 0, y: 0, button: 0, ...e })),
      handle: {
        id,
        pack: { id: packId },
        get position() { return pos.value; },
        velocity: { x: 0, y: 0 },
        get bounds() { return { x: pos.value.x - 112, y: pos.value.y - 428, width: 224, height: 448 }; },
        get opaqueBounds() { return { x: pos.value.x - 50, y: pos.value.y - 390, width: 100, height: 392 }; },
        get stateKey() { return state.value; },
        on: (ev, fn) => { if (ev === 'input') inputFns.push(fn); return { dispose() {} }; },
        channel: (name) => (name === 'position' ? { request: (r) => pos.request(r, 'fantasy-trio'), entries: () => pos.entries(), get value() { return pos.value; } } : null),
        motion: { add: (src, opts) => { const h = { src, opts, dispose() { motions.delete(h); } }; motions.add(h); return h; } },
        showState: (key, o) => state.request({ priority: o?.priority ?? 40, value: key, releaseOn: o?.releaseOn }, 'fantasy-trio'),
        say: (text) => { said.push(text); return { dispose() {} }; },
        pluginConfig: () => packs[packId]?.plugins?.['fantasy-trio'],
      },
    };
    pets.push(pet);
    listeners.added.forEach((f) => f(pet.handle));
    return pet;
  }

  const ctx = {
    id: 'fantasy-trio',
    log: { info: (...a) => log.push(['info', ...a]), warn: (...a) => log.push(['warn', ...a]), error: (...a) => log.push(['error', ...a]) },
    pets: {
      list: () => pets.map((p) => p.handle),
      add: async (o) => makePet(o.pack, o.position ?? { x: 960, y: 800 }, o.scale ?? 1).handle,
      remove: (id) => {
        const i = pets.findIndex((p) => p.id === id);
        if (i < 0) return;
        const [p] = pets.splice(i, 1);
        listeners.removed.forEach((f) => f(p.handle));
      },
      on: (ev, fn) => { listeners[ev].push(fn); return { dispose() {} }; },
    },
    desktop: { screens: () => [{ x: 0, y: 0, width: 1920, height: 1040 }] },
    tray: { addItem: (item) => { const h = { ...item, update(p) { Object.assign(h, p); }, dispose() {} }; tray.push(h); return h; } },
    settings: store(settings),
    data: store(),
    host: {
      paths: { home: 'C:\\Users\\me', appData: 'C:\\Users\\me\\AppData\\Roaming\\com.petween.app' },
      fs: {
        exists: async (p) => installed.some((id) => p.endsWith(`\\pets\\${id}\\pet.json`)),
        readText: async (p) => {
          assert.ok(p.endsWith('\\instances.json'));
          return JSON.stringify({ pets: pets.map((x) => ({ id: x.id, pack: x.packId, scale: x.scale })) });
        },
      },
    },
    settingsPage: { handle() { return { dispose() {} }; } },
    setTimeout: (fn, ms) => { const t = { at: clock + ms, fn, dead: false }; timers.push(t); return { dispose() { t.dead = true; } }; },
    setInterval: (fn, ms) => { const t = { at: clock + ms, fn, every: ms, dead: false }; timers.push(t); return { dispose() { t.dead = true; } }; },
    requestFrame: (fn) => { frames.add(fn); return { dispose() { frames.delete(fn); } }; },
  };

  for (const i of instances) makePet(i.pack, i.position, i.scale, i.id);

  /** Advance the clock in 16 ms frames, firing timers and frame callbacks like the app would. */
  async function run(ms) {
    for (const end = clock + ms; clock < end; ) {
      clock += 16;
      for (const t of [...timers]) {
        if (t.dead || t.at > clock) continue;
        if (t.every) t.at += t.every;
        else t.dead = true;
        t.fn();
      }
      for (const f of [...frames]) f(clock, 16);
      if (clock % 96 < 16) await null; // let the plugin's async work (reconcile) run
    }
    await new Promise((r) => setImmediate(r));
  }
  const byChar = (c) => pets.find((p) => p.packId === c);
  return { ctx, pets, run, byChar, log, tray, frames, makePet };
}

const realRandom = Math.random;
function withSeed(seed, fn) {
  return async () => {
    Math.random = seeded(seed);
    clock = 0;
    try {
      await fn();
    } finally {
      Math.random = realRandom;
    }
  };
}

test('first run: the three characters appear, spaced out, and are saved as real pets', withSeed(1, async () => {
  const w = makeWorld();
  plugin.activate(w.ctx);
  await w.run(100);
  assert.deepEqual(w.pets.map((p) => p.packId).sort(), ['freya', 'fufu', 'xiaomalei']);
  const xs = w.pets.map((p) => p.pos.value.x).sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] > 200 && xs[2] - xs[1] > 200);
  await w.run(8000);
  assert.ok(w.pets.every((p) => p.said.length >= 1), 'each one says hello');
}));

test('a pack that is not installed is skipped with a warning, the others still appear', withSeed(1, async () => {
  const w = makeWorld({ installed: ['xiaomalei', 'freya'] });
  plugin.activate(w.ctx);
  await w.run(100);
  assert.deepEqual(w.pets.map((p) => p.packId).sort(), ['freya', 'xiaomalei']);
  assert.ok(w.log.some((l) => l[0] === 'warn' && String(l[1]).includes('fufu')));
}));

test('existing pets are adopted, not duplicated; other pets are left alone', withSeed(1, async () => {
  const w = makeWorld({
    instances: [
      { id: 'pet-a', pack: 'default', position: { x: 1500, y: 900 } },
      { id: 'pet-b', pack: 'fufu', position: { x: 400, y: 1030 }, scale: 1.5 },
    ],
  });
  plugin.activate(w.ctx);
  await w.run(100);
  assert.equal(w.pets.filter((p) => p.packId === 'fufu').length, 1);
  assert.equal(w.byChar('fufu').id, 'pet-b');
  assert.equal(w.pets.length, 4);
  await w.run(120000);
  assert.deepEqual(w.byChar('default').pos.value, { x: 1500, y: 900 }, 'a non-trio pet is never moved');
  assert.equal(w.byChar('default').state.value, 'idle');
}));

test('they walk on their own, stay on screen, keep apart, and release the position when they stop', withSeed(5, async () => {
  const w = makeWorld();
  plugin.activate(w.ctx);
  await w.run(100);
  const start = Object.fromEntries(w.pets.map((p) => [p.packId, p.pos.value.x]));
  let sawWalk = false;
  let sawFlip = false;
  let tooClose = 0;
  for (let i = 0; i < 600; i++) {
    await w.run(500);
    const xs = w.pets.map((p) => p.pos.value.x).sort((a, b) => a - b);
    assert.ok(xs[0] >= 50 && xs[2] <= 1870, `on screen: ${xs}`);
    if (xs[1] - xs[0] < 50 || xs[2] - xs[1] < 50) tooClose++;
    for (const p of w.pets) {
      if (p.state.value === 'fantasy-trio.walk') sawWalk = true;
      if (p.motions.size) {
        sawFlip = true;
        assert.ok(['fantasy-trio.walk', 'fantasy-trio.sit', 'fantasy-trio.sleep'].includes(p.state.value), 'mirrored only in side-view states');
        assert.equal([...p.motions][0].opts.layer, 'base');
      }
      assert.equal(p.pos.value.y, 1034, 'walking never changes the height');
      if (p.state.value !== 'fantasy-trio.walk') assert.equal(p.pos.entries().length, 0, 'no position lease while not walking');
    }
  }
  assert.ok(sawWalk && sawFlip);
  assert.equal(tooClose, 0);
  for (const p of w.pets) assert.notEqual(p.pos.value.x, start[p.packId], `${p.packId} moved`);
  for (const p of w.pets) assert.deepEqual(p.pos.base, p.pos.stack.length ? p.pos.base : p.pos.value, 'stopped position became the saved base');
}));

test('no frame callback is held while everyone rests', withSeed(5, async () => {
  const w = makeWorld({ settings: { roam: false } });
  plugin.activate(w.ctx);
  await w.run(30000);
  assert.equal(w.frames.size, 0);
  assert.ok(w.pets.every((p) => p.pos.entries().length === 0));
}));

test('dragging takes over at once; afterwards the character stays where it was dropped, then roams again', withSeed(7, async () => {
  const w = makeWorld();
  plugin.activate(w.ctx);
  await w.run(100);
  const p = w.byChar('xiaomalei');
  // wait until she walks, then grab her mid-walk the way the physics plugin does (95, preempt)
  for (let i = 0; i < 4000 && p.state.value !== 'fantasy-trio.walk'; i++) await w.run(50);
  assert.equal(p.state.value, 'fantasy-trio.walk');
  p.input({ type: 'drag-start' });
  const drag = p.pos.request({ priority: 95, value: p.pos.value, preempt: true }, 'physics');
  assert.equal(p.state.value, 'fantasy-trio.dragged');
  drag.update({ x: 1200, y: 400 });
  await w.run(3000);
  assert.deepEqual(p.pos.value, { x: 1200, y: 400 }, 'the plugin does not fight the drag');
  assert.equal(p.pos.entries().length, 1);
  p.input({ type: 'drag-end' });
  drag.release();
  await w.run(1000);
  assert.deepEqual(p.pos.value, { x: 1200, y: 400 });
  assert.notEqual(p.state.value, 'fantasy-trio.dragged');
  await w.run(90000);
  assert.notEqual(p.pos.value.x, 1200, 'roams again');
  assert.equal(p.pos.value.y, 400, 'on the height the user chose');
}));

test('a throw still in flight is left alone', withSeed(7, async () => {
  const w = makeWorld();
  plugin.activate(w.ctx);
  await w.run(100);
  const p = w.byChar('freya');
  p.input({ type: 'drag-start' });
  const drag = p.pos.request({ priority: 95, value: p.pos.value, preempt: true }, 'physics');
  p.input({ type: 'drag-end' });
  drag.release();
  const flight = p.pos.request({ priority: 85, value: { x: 700, y: 300 }, preempt: true }, 'physics');
  await w.run(20000);
  assert.deepEqual(p.pos.value, { x: 700, y: 300 });
  assert.equal(p.pos.entries().filter((e) => e.owner === 'fantasy-trio').length, 0);
  flight.release();
  await w.run(90000);
  assert.notEqual(p.pos.value.x, 700);
}));

test('click: says one of her own lines and reacts; hover needs a dwell', withSeed(3, async () => {
  const w = makeWorld({ settings: { roam: false } });
  plugin.activate(w.ctx);
  await w.run(10000);
  const p = w.byChar('fufu');
  const lines = JSON.parse(readFileSync(new URL('../packs/fufu/pet.json', import.meta.url), 'utf8')).plugins['fantasy-trio'].lines;
  const before = p.said.length;
  p.input({ type: 'click' });
  assert.equal(p.said.length, before + 1);
  assert.ok(lines.click.includes(p.said.at(-1)));
  assert.equal(p.state.value, 'fantasy-trio.react');
  await w.run(4000);
  assert.notEqual(p.state.value, 'fantasy-trio.react');

  const n = p.said.length;
  p.input({ type: 'hover-start' });
  await w.run(500);
  p.input({ type: 'hover-end' });
  await w.run(3000);
  assert.equal(p.said.length, n, 'a pass-over says nothing');
  p.input({ type: 'hover-start' });
  await w.run(1500);
  assert.equal(p.said.length, n + 1);
  assert.ok(lines.hover.includes(p.said.at(-1)));
  // other characters never speak her lines
  for (const o of w.pets) if (o !== p) assert.ok(o.said.every((s) => !lines.click.includes(s) && !lines.hover.includes(s)));
}));

test('hide keeps position and size; show puts her back', withSeed(2, async () => {
  const w = makeWorld({ settings: { roam: false } });
  plugin.activate(w.ctx);
  await w.run(100);
  const p = w.byChar('freya');
  p.scale = 1.6;
  const drag = p.pos.request({ priority: 95, value: { x: 333, y: 444 }, preempt: true }, 'physics');
  drag.release();
  w.ctx.settings.set('show.freya', false);
  await w.run(200);
  assert.equal(w.byChar('freya'), undefined);
  assert.equal(w.pets.length, 2, 'the other two stay');
  assert.equal(w.tray.find((t) => t.label.includes('芙蕾雅')).checked, false);
  w.ctx.settings.set('show.freya', true);
  await w.run(200);
  const back = w.byChar('freya');
  assert.deepEqual(back.pos.value, { x: 333, y: 444 });
  assert.equal(back.scale, 1.6);
}));

test('an agent state takes over: the plugin lets go, and comes back when the brain is idle again', withSeed(4, async () => {
  const w = makeWorld();
  plugin.activate(w.ctx);
  await w.run(100);
  const p = w.byChar('xiaomalei');
  for (let i = 0; i < 4000 && p.state.value !== 'fantasy-trio.walk'; i++) await w.run(50);
  p.state.setBase('active.thinking'); // the brain's output changes
  await w.run(600);
  assert.equal(p.state.value, 'active.thinking');
  assert.equal(p.pos.entries().length, 0);
  const x = p.pos.value.x;
  await w.run(60000);
  assert.equal(p.pos.value.x, x, 'does not wander while the agent works');
  assert.equal(p.state.value, 'active.thinking');
  p.state.setBase('idle');
  await w.run(90000);
  assert.notEqual(p.pos.value.x, x);
}));
