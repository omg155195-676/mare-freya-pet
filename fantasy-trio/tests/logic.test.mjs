// node --test tests/        (no dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mind, STATE, blockedAhead, crosses, mergeBehavior, overlapEscape, pickLine, pickScreen, pickTarget, walkRange } from '../plugin/fantasy-trio/logic.js';

/** Deterministic rng. */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SCREEN = { x: 0, y: 0, width: 1920, height: 1040 };

test('mergeBehavior keeps defaults for bad values', () => {
  const b = mergeBehavior({ walkSpeed: 120, restMs: [9000, 3000], sitChance: 'x', chatterMs: [1] });
  assert.equal(b.walkSpeed, 120);
  assert.deepEqual(b.restMs, [3000, 9000]);
  assert.equal(b.sitChance, 0.25);
  assert.deepEqual(b.chatterMs, [70000, 160000]);
});

test('pickLine never repeats the previous line and skips blanks', () => {
  const rng = seeded(7);
  const lines = ['a', '', 'b', 'c'];
  let last = -1;
  for (let i = 0; i < 200; i++) {
    const l = pickLine(rng, lines, last);
    assert.ok(l.text);
    assert.notEqual(l.index, last);
    last = l.index;
  }
  assert.equal(pickLine(rng, [], -1), null);
  assert.equal(pickLine(rng, ['only'], 0).text, 'only');
});

test('walkRange keeps the whole figure on the screen', () => {
  assert.deepEqual(walkRange(SCREEN, 50, 10), [60, 1860]);
  const tiny = walkRange({ x: 100, y: 0, width: 60, height: 100 }, 50);
  assert.equal(tiny[0], tiny[1]);
});

test('pickScreen: inside, else nearest', () => {
  const second = { x: 1920, y: 0, width: 1280, height: 1000 };
  assert.equal(pickScreen([SCREEN, second], { x: 2500, y: 500 }), second);
  assert.equal(pickScreen([SCREEN, second], { x: -300, y: 500 }), SCREEN);
  assert.equal(pickScreen([], { x: 0, y: 0 }), null);
});

test('pickTarget keeps its distance and never walks through someone', () => {
  const rng = seeded(3);
  const others = [900, 1300];
  for (let i = 0; i < 300; i++) {
    const x = 60 + rng() * 700; // left of both
    const t = pickTarget(rng, x, [60, 1860], others, 150);
    if (t === null) continue;
    assert.ok(Math.abs(t - x) >= 80);
    for (const o of others) assert.ok(Math.abs(t - o) >= 150, `target ${t} too close to ${o}`);
    assert.ok(t < 900, `target ${t} is behind another character`);
  }
});

test('pickTarget returns null when boxed in', () => {
  assert.equal(pickTarget(seeded(1), 500, [450, 550], [380, 620], 150), null);
});

test('crosses / blockedAhead / overlapEscape', () => {
  assert.equal(crosses(100, 800, [500], 150), true);
  assert.equal(crosses(100, 300, [500], 150), false);
  assert.equal(crosses(600, 100, [800], 150), false);
  assert.equal(blockedAhead(100, 1, [220], 150), true);
  assert.equal(blockedAhead(100, -1, [220], 150), false);
  assert.equal(overlapEscape(100, [400], 150, seeded()), 0);
  assert.equal(overlapEscape(100, [130], 150, seeded()), -1);
  assert.equal(overlapEscape(130, [100], 150, seeded()), 1);
});

/** Runs one Mind for a while in a fixed world; returns the trace. */
function run(mind, { x = 500, others = [], ms = 60000, dt = 50, range = [60, 1860], minGap = 150, canMove = true, onStep } = {}) {
  const trace = [];
  for (let t = 0; t <= ms; t += dt) {
    const r = mind.update(t, dt, { x, range, others, minGap, canMove, flying: false });
    if (r.moveTo !== null) x = r.moveTo;
    trace.push({ t, x, phase: mind.phase, state: r.state, event: r.event, facing: mind.facing });
    onStep?.(t, x, r);
  }
  return trace;
}

test('a character rests, turns, walks and arrives', () => {
  const mind = new Mind({ rng: seeded(11), behavior: { sleepChance: 0, sitChance: 0 } });
  const trace = run(mind, { ms: 120000 });
  const phases = new Set(trace.map((s) => s.phase));
  assert.ok(phases.has('rest') && phases.has('walk') && phases.has('turn'));
  assert.ok(trace.some((s) => s.event === 'arrived'));
  assert.ok(new Set(trace.map((s) => Math.round(s.x))).size > 10, 'it moved');
  // walking speed: never faster than walkSpeed
  for (let i = 1; i < trace.length; i++) assert.ok(Math.abs(trace[i].x - trace[i - 1].x) <= 90 * 0.05 + 1e-6);
  // it faces the way it walks
  for (let i = 1; i < trace.length; i++) {
    const dx = trace[i].x - trace[i - 1].x;
    if (dx !== 0) assert.equal(Math.sign(dx), trace[i - 1].phase === 'walk' ? trace[i - 1].facing : Math.sign(dx));
  }
  assert.ok(trace.every((s) => s.x >= 60 && s.x <= 1860));
});

test('states follow the phase', () => {
  const mind = new Mind({ rng: seeded(5), behavior: { sleepChance: 0, sitChance: 1 } });
  const trace = run(mind, { ms: 90000 });
  for (const s of trace) {
    if (s.phase === 'walk') assert.equal(s.state, STATE.walk);
    if (s.phase === 'turn') assert.equal(s.state, STATE.turn);
  }
  assert.ok(trace.some((s) => s.state === STATE.sit), 'sits during some rests');
});

test('held: no movement; after release it settles, then roams again', () => {
  const mind = new Mind({ rng: seeded(2), behavior: { sleepChance: 0, sitChance: 0 } });
  let x = 500;
  let t = 0;
  const tick = (ms, flying = false) => {
    for (const end = t + ms; t < end; t += 50) {
      const r = mind.update(t, 50, { x, range: [60, 1860], others: [], minGap: 150, canMove: true, flying });
      if (r.moveTo !== null) x = r.moveTo;
    }
  };
  tick(8000);
  mind.hold();
  const held = x;
  tick(5000);
  assert.equal(x, held);
  assert.equal(mind.shownState(), STATE.dragged);
  assert.equal(mind.react(t, 1000), false, 'no click reaction while held');
  mind.release(t);
  tick(3000, true); // thrown: still flying, keeps waiting
  assert.equal(mind.phase, 'settle');
  assert.equal(x, held);
  tick(60000);
  assert.notEqual(x, held, 'walks again after being dropped');
});

test('click reaction pauses a walk and then it carries on', () => {
  const mind = new Mind({ rng: seeded(9), behavior: { sleepChance: 0, sitChance: 0 } });
  const trace = run(mind, {
    ms: 60000,
    onStep: (t) => {
      if (mind.phase === 'walk' && !mind.clicked) {
        mind.clicked = t;
        assert.equal(mind.react(t, 1400), true);
      }
    },
  });
  const at = mind.clicked;
  assert.ok(at !== undefined);
  const during = trace.filter((s) => s.t > at && s.t < at + 1400);
  assert.ok(during.every((s) => s.state === STATE.react));
  assert.equal(new Set(during.map((s) => s.x)).size, 1, 'stands still while reacting');
  assert.ok(trace.some((s) => s.t > at + 1400 && s.phase === 'walk'));
});

test('cannot move (agent busy / roaming off): stays put', () => {
  const mind = new Mind({ rng: seeded(4) });
  const trace = run(mind, { canMove: false, ms: 60000 });
  assert.equal(new Set(trace.map((s) => s.x)).size, 1);
});

test('interrupt stops a walk', () => {
  const mind = new Mind({ rng: seeded(6), behavior: { sleepChance: 0, sitChance: 0 } });
  run(mind, { ms: 60000, onStep: (t) => { if (mind.phase === 'walk' && !mind.cut) { mind.cut = true; mind.interrupt(t); assert.equal(mind.phase, 'rest'); } } });
  assert.ok(mind.cut);
});

test('three characters share a floor without walking through or stacking on each other', () => {
  const rng = seeded(42);
  const minds = [0, 1, 2].map(() => new Mind({ rng, behavior: { sleepChance: 0, sitChance: 0.2, restMs: [1500, 4000] } }));
  const xs = [500, 520, 1400]; // two start almost on top of each other
  const order = () => [0, 1, 2].sort((a, b) => xs[a] - xs[b]).join('');
  const minGap = 150;
  let stackedMs = 0;
  let passes = 0;
  let prev = order();
  const moved = [0, 0, 0];
  for (let t = 0; t <= 10 * 60000; t += 50) {
    minds.forEach((m, i) => {
      const r = m.update(t, 50, { x: xs[i], range: [60, 1860], others: xs.filter((_, j) => j !== i), minGap, canMove: true, flying: false });
      if (r.moveTo !== null) {
        moved[i] += Math.abs(r.moveTo - xs[i]);
        xs[i] = r.moveTo;
      }
    });
    const o = order();
    if (t > 15000 && o !== prev) passes++;
    prev = o;
    if (t > 15000) {
      const s = [...xs].sort((a, b) => a - b);
      if (s[1] - s[0] < minGap * 0.5 || s[2] - s[1] < minGap * 0.5) stackedMs += 50;
    }
  }
  assert.equal(passes, 0, 'nobody walks through anybody');
  assert.equal(stackedMs, 0, 'nobody stays on top of anybody');
  assert.ok(moved.every((d) => d > 500), `everyone keeps moving: ${moved.map(Math.round)}`);
});
