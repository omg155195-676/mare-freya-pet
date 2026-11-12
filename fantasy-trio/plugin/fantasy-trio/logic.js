// Fantasy Trio — behaviour logic (Phase 2A). Pure: no Petween API, no timers, no DOM.
// main.js feeds it the clock and the world and applies what it decides, so this file can be tested
// with plain `node --test`.

export const STATE = {
  walk: 'fantasy-trio.walk',
  turn: 'fantasy-trio.turn',
  sit: 'fantasy-trio.sit',
  sleep: 'fantasy-trio.sleep',
  wave: 'fantasy-trio.wave',
  react: 'fantasy-trio.react',
  dragged: 'fantasy-trio.dragged',
  stand: 'idle',
};

/** States drawn in side view: only these are mirrored when the character faces left. */
export const DIRECTIONAL = new Set([STATE.walk, STATE.sit, STATE.sleep]);

export const DEFAULT_BEHAVIOR = {
  /** Desktop px per second. */
  walkSpeed: 90,
  /** How long a rest lasts, [min, max] ms. */
  restMs: [5000, 12000],
  /** Chance that a rest is spent sitting. */
  sitChance: 0.25,
  /** Chance that a rest is a long nap. */
  sleepChance: 0.08,
  /** Random idle line every [min, max] ms. */
  chatterMs: [70000, 160000],
  /** Chance to wave when stopping next to another character. */
  waveChance: 0.3,
};

const TURN_MS = 260;
const SETTLE_MS = 1600;
const BLOCKED_REST_MS = [900, 2200];
const AFTER_DRAG_REST_MS = [1800, 3500];
const NAP_FACTOR = 4;

export function mergeBehavior(cfg) {
  const out = { ...DEFAULT_BEHAVIOR };
  if (!cfg || typeof cfg !== 'object') return out;
  for (const k of Object.keys(out)) {
    const v = cfg[k];
    if (Array.isArray(out[k])) {
      if (Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n) && n >= 0)) out[k] = [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
    } else if (Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export const between = (rng, [a, b]) => a + (b - a) * rng();

/** A random line, not the same one twice in a row. */
export function pickLine(rng, lines, last = -1) {
  if (!Array.isArray(lines)) return null;
  const usable = lines.map((text, index) => ({ text, index })).filter((l) => typeof l.text === 'string' && l.text.trim());
  if (!usable.length) return null;
  const pool = usable.length > 1 ? usable.filter((l) => l.index !== last) : usable;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** Where the anchor may stand on a screen so the whole figure stays on it. */
export function walkRange(screen, halfWidth, margin = 12) {
  const min = screen.x + halfWidth + margin;
  const max = screen.x + screen.width - halfWidth - margin;
  return min <= max ? [min, max] : [screen.x + screen.width / 2, screen.x + screen.width / 2];
}

export function pickScreen(screens, p) {
  if (!screens.length) return null;
  const inside = screens.find((s) => p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height);
  if (inside) return inside;
  const d = (s) => Math.hypot(Math.max(s.x - p.x, 0, p.x - s.x - s.width), Math.max(s.y - p.y, 0, p.y - s.y - s.height));
  return screens.reduce((a, b) => (d(b) < d(a) ? b : a));
}

/**
 * A spot to walk to: at least `minStep` away, at least `minGap` from every other character, and not
 * on the far side of one (walking through each other). `prefer` (-1 / 1) biases the side.
 * Returns null when there is nowhere to go.
 */
export function pickTarget(rng, x, [min, max], others, minGap, minStep = 80, prefer = 0) {
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const c = min + (max - min) * rng();
    if (Math.abs(c - x) < minStep) continue;
    if (crosses(x, c, others, minGap)) continue;
    const gap = others.length ? Math.min(...others.map((o) => Math.abs(o - c))) : Infinity;
    if (gap < minGap) continue;
    const score = Math.min(gap, minGap * 3) + (prefer && Math.sign(c - x) === prefer ? minGap * 2 : 0) + rng() * minGap;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Would going from x to target pass through (or stop inside) another character's space? */
export function crosses(x, target, others, minGap) {
  const lo = Math.min(x, target);
  const hi = Math.max(x, target);
  return others.some((o) => o > lo - minGap && o < hi + minGap && Math.abs(o - x) >= minGap * 0.5 && Math.sign(o - x) === Math.sign(target - x));
}

/** Someone stands within `minGap` in the walking direction. */
export function blockedAhead(x, dir, others, minGap) {
  return others.some((o) => (o - x) * dir > 0 && Math.abs(o - x) < minGap);
}

/** Which way to step out when standing on top of someone: -1 / 1, or 0 when clear. */
export function overlapEscape(x, others, minGap, rng) {
  const near = others.filter((o) => Math.abs(o - x) < minGap * 0.55);
  if (!near.length) return 0;
  const o = near.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  if (o === x) return rng() < 0.5 ? -1 : 1;
  return x < o ? -1 : 1;
}

/**
 * One character's behaviour: rest → (turn) → walk → rest, with being held, reacting and avoiding.
 *
 * update(now, dt, world) → { state, moveTo, event }
 *   world: { x, range: [min, max], others: number[], minGap, canMove }
 *   state:  the state key to show while the brain is idle (null = leave the brain's)
 *   moveTo: new x while walking, else null
 *   event:  'arrived' | 'blocked' | 'wave' | null — something that just happened this update
 */
export class Mind {
  constructor({ behavior, rng = Math.random, facing = 1, now = 0 } = {}) {
    this.b = mergeBehavior(behavior);
    this.rng = rng;
    this.facing = facing;
    this.phase = 'rest';
    this.pose = STATE.stand;
    this.until = now + between(rng, [1500, 4000]); // do not all set off at once after start
    this.target = null;
    this.dir = facing;
    this.prefer = 0;
    this.after = null;
  }

  get walking() {
    return this.phase === 'walk';
  }

  /** The user grabbed the character. */
  hold() {
    this.phase = 'held';
    this.target = null;
  }

  /** The user let go: wait for it to settle (a throw may still be flying), then rest a little. */
  release(now) {
    if (this.phase !== 'held') return;
    this.phase = 'settle';
    this.until = now + SETTLE_MS;
  }

  /** A short reaction (click, wave) that pauses whatever it was doing. Ignored while held. */
  react(now, ms, state = STATE.react) {
    if (this.phase === 'held' || this.phase === 'settle') return false;
    this.phase = 'react';
    this.pose = state;
    this.until = now + ms;
    this.target = null;
    return true;
  }

  /** Something else took over (position lease lost, the agent became busy): stop and think again later. */
  interrupt(now, restMs = BLOCKED_REST_MS) {
    if (this.phase === 'held' || this.phase === 'settle') return;
    this.rest(now, restMs, false);
  }

  rest(now, range = this.b.restMs, allowPose = true) {
    this.phase = 'rest';
    this.target = null;
    let ms = between(this.rng, range);
    this.pose = STATE.stand;
    if (allowPose) {
      const r = this.rng();
      if (r < this.b.sleepChance) {
        this.pose = STATE.sleep;
        ms *= NAP_FACTOR;
      } else if (r < this.b.sleepChance + this.b.sitChance) this.pose = STATE.sit;
    }
    this.until = now + ms;
  }

  update(now, dt, w) {
    let event = null;
    let moveTo = null;

    if (this.phase === 'settle' && now >= this.until && !w.flying) this.rest(now, AFTER_DRAG_REST_MS, false);

    if (this.phase === 'react' && now >= this.until) this.rest(now, BLOCKED_REST_MS, false);

    if (this.phase === 'rest') {
      const escape = w.canMove ? overlapEscape(w.x, w.others, w.minGap, this.rng) : 0;
      if (escape && this.pose !== STATE.stand) this.pose = STATE.stand; // get up before stepping aside
      if (escape) {
        this.prefer = escape;
        this.until = Math.min(this.until, now);
      }
      if (now >= this.until) {
        if (!w.canMove) this.until = now + 1000;
        else {
          // Standing on someone: any step that side will do, even a short one into the open.
          const t = escape
            ? stepAside(w.x, escape, w.range, w.minGap)
            : pickTarget(this.rng, w.x, w.range, w.others, w.minGap, 80, this.prefer);
          this.prefer = 0;
          if (t === null || Math.abs(t - w.x) < 2) this.rest(now, BLOCKED_REST_MS, false);
          else {
            this.target = t;
            this.dir = t > w.x ? 1 : -1;
            if (this.dir !== this.facing) {
              this.phase = 'turn';
              this.until = now + TURN_MS;
            } else this.phase = 'walk';
          }
        }
      }
    } else if (this.phase === 'turn') {
      if (now >= this.until) {
        this.facing = this.dir;
        this.phase = 'walk';
      }
    } else if (this.phase === 'walk') {
      if (!w.canMove) this.rest(now, BLOCKED_REST_MS, false);
      else if (blockedAhead(w.x, this.dir, w.others, w.minGap)) {
        // Someone is in the way: stop, maybe greet, and go the other way next time.
        this.prefer = -this.dir;
        if (this.rng() < this.b.waveChance) {
          this.react(now, 1300, STATE.wave);
          event = 'wave';
        } else {
          this.rest(now, BLOCKED_REST_MS, false);
          event = 'blocked';
        }
      } else {
        const step = (this.b.walkSpeed * dt) / 1000;
        const left = this.target - w.x;
        if (Math.abs(left) <= step) {
          moveTo = clamp(this.target, w.range);
          this.rest(now);
          event = 'arrived';
        } else moveTo = clamp(w.x + Math.sign(left) * step, w.range);
      }
    }

    return { state: this.shownState(), moveTo, event };
  }

  shownState() {
    switch (this.phase) {
      case 'walk':
        return STATE.walk;
      case 'turn':
        return STATE.turn;
      case 'held':
        return STATE.dragged;
      case 'settle':
        return STATE.stand;
      default:
        return this.pose;
    }
  }
}

function stepAside(x, dir, [min, max], minGap) {
  const t = clamp(x + dir * minGap * 1.2, [min, max]);
  if (Math.abs(t - x) >= 2) return t;
  // Against the edge of the screen: go the other way instead.
  return clamp(x - dir * minGap * 1.2, [min, max]);
}

function clamp(v, [min, max]) {
  return Math.max(min, Math.min(max, v));
}
