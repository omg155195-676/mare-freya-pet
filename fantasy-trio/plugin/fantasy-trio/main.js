// Fantasy Trio — desktop behaviour plugin for Petween (Phase 2A).
// A third-party plugin: it uses only the public plugin API (docs/06, apiVersion 1) and changes nothing
// in Petween itself. Install: copy this folder to <app data>/plugins/fantasy-trio and restart Petween.
//
// What it does
//   - keeps the three characters on the desktop (each can be shown / hidden on its own);
//   - lets each one wander by itself: rest → turn → walk → rest, keeping clear of the others;
//   - steps back while the user drags one and resumes afterwards;
//   - answers clicks and hovering with that character's own lines.
// A character is any pet whose pack carries `plugins["fantasy-trio"].character` in its pet.json: lines
// and behaviour numbers live in the pack (pure data), not here.
//
// Channel use (docs/02): `state` and `position` at priority 20 (resident behaviour), short reactions
// at 45, the dragged pose at 60. Dragging (physics, 95, preempt) always wins over walking.

import { DIRECTIONAL, Mind, STATE, between, pickLine, pickScreen, walkRange } from './logic.js';

const ROSTER = ['xiaomalei', 'fufu', 'freya'];
const TICK_MS = 250;
const PRIORITY = { resident: 20, reaction: 45, dragged: 60 };
const HOVER_DWELL_MS = 1200;
const HOVER_COOLDOWN_MS = 20000;
const FLIP = { duration: null, evaluate: () => ({ scaleX: -1 }) };

const now = () => performance.now();
const isIdleKey = (k) => k === 'idle' || k.startsWith('idle.') || k.startsWith('fantasy-trio.') || k.startsWith('physics.');

function priorityOf(state) {
  if (state === STATE.dragged) return PRIORITY.dragged;
  if (state === STATE.react || state === STATE.wave) return PRIORITY.reaction;
  return PRIORITY.resident;
}

export default {
  /** @param {any} ctx PluginContext (src/api/types.ts in Petween) */
  activate(ctx) {
    const rng = Math.random;
    /** @type {Map<string, any>} pet id → controller */
    const actors = new Map();
    let frameSub = null;
    let reconciling = false;
    let again = false;
    const warned = new Set();

    const setting = (key, fallback) => ctx.settings.get(key, fallback);
    const sep = ctx.host.paths.appData.includes('\\') ? '\\' : '/';
    const appFile = (...parts) => [ctx.host.paths.appData, ...parts].join(sep);
    const characterOf = (pet) => {
      const cfg = pet.pluginConfig();
      return cfg && typeof cfg.character === 'string' ? cfg : null;
    };

    // ---------- one character ----------

    function attach(pet) {
      const cfg = characterOf(pet);
      if (!cfg || actors.has(pet.id)) return;
      const a = {
        pet,
        cfg,
        mind: new Mind({ behavior: cfg.behavior, rng, now: now() }),
        stateLease: null,
        stateKey: null,
        posLease: null,
        flip: null,
        bubble: null,
        lastLine: {},
        busy: false,
        hovering: false,
        hoverTimer: null,
        hoverSaidAt: -Infinity,
        chatterAt: now() + between(rng, cfg.behavior?.chatterMs ?? [70000, 160000]),
        subs: [],
      };
      a.subs.push(pet.on('input', (e) => onInput(a, e)));
      actors.set(pet.id, a);
      ctx.log.info(`attached ${cfg.character} (${pet.id})`);
    }

    function detach(pet) {
      const a = actors.get(pet.id);
      if (!a) return;
      actors.delete(pet.id);
      for (const s of a.subs) s.dispose();
      a.hoverTimer?.dispose();
      a.stateLease?.release();
      a.posLease?.release();
      a.flip?.dispose();
      a.bubble?.dispose();
    }

    function say(a, kind, chance = 1) {
      if (!setting('chatter', true) && kind === 'idle') return;
      if (rng() > chance) return;
      const line = pickLine(rng, a.cfg.lines?.[kind], a.lastLine[kind]);
      if (!line) return;
      a.lastLine[kind] = line.index;
      a.bubble?.dispose();
      a.bubble = a.pet.say(line.text, { ttlMs: 3600, group: 'talk' });
    }

    function onInput(a, e) {
      const t = now();
      if (e.type === 'drag-start') {
        a.mind.hold();
        dropPosition(a);
        say(a, 'dragStart', 0.6);
        step(t, 0);
      } else if (e.type === 'drag-end') {
        a.mind.release(t);
        say(a, 'dragEnd', 0.5);
      } else if (e.type === 'click' && e.button === 0) {
        if (a.mind.react(t, 1400)) {
          dropPosition(a);
          say(a, 'click');
          step(t, 0);
        }
      } else if (e.type === 'hover-start') {
        a.hovering = true;
        a.hoverTimer?.dispose();
        a.hoverTimer = ctx.setTimeout(() => {
          if (!a.hovering || now() - a.hoverSaidAt < HOVER_COOLDOWN_MS || a.mind.phase === 'held') return;
          a.hoverSaidAt = now();
          say(a, 'hover');
        }, HOVER_DWELL_MS);
      } else if (e.type === 'hover-end') {
        a.hovering = false;
        a.hoverTimer?.dispose();
        a.hoverTimer = null;
      }
    }

    // ---------- applying what the mind decides ----------

    function dropPosition(a) {
      const l = a.posLease;
      a.posLease = null;
      l?.release(); // an active lease leaves its last value as the saved base position (docs/02)
    }

    function showState(a, key) {
      // The brain's output changed under our lease ('signal-change'): look at what it says now.
      if (a.stateLease?.revoked) {
        a.stateLease = null;
        a.stateKey = null;
      }
      if (!a.stateLease || !a.stateLease.active) {
        const idle = isIdleKey(a.pet.stateKey);
        if (!a.stateLease && a.busy !== !idle) {
          a.busy = !idle;
          if (a.busy) {
            a.mind.interrupt(now());
            dropPosition(a);
          }
        }
      }
      if (a.busy) key = a.mind.phase === 'held' ? STATE.dragged : null; // an agent is working: its states show

      if (key === a.stateKey && a.stateLease) return;
      a.stateLease?.release();
      a.stateLease = null;
      a.stateKey = key;
      if (key) a.stateLease = a.pet.showState(key, { priority: priorityOf(key), releaseOn: key === STATE.dragged ? 'never' : 'signal-change' });
    }

    function setFlip(a, on) {
      if (on && !a.flip) a.flip = a.pet.motion.add(FLIP, { layer: 'base', blend: 'add' });
      else if (!on && a.flip) {
        a.flip.dispose();
        a.flip = null;
      }
    }

    function worldFor(a) {
      const p = a.pet.position;
      const box = a.pet.opaqueBounds;
      const h = box.height || 300;
      const half = Math.max(30, (box.width || 100) / 2);
      const screen = pickScreen(ctx.desktop.screens(), p);
      const others = [];
      let widest = half * 2;
      for (const o of ctx.pets.list()) {
        if (o.id === a.pet.id) continue;
        const q = o.position;
        if (Math.abs(q.y - p.y) > h * 0.6) continue; // on another "floor": not in the way
        others.push(q.x);
        widest = Math.max(widest, o.opaqueBounds.width || 0);
      }
      const leases = a.pet.channel('position').entries();
      return {
        x: p.x,
        range: screen ? walkRange(screen, half) : [p.x, p.x],
        others,
        minGap: widest * 0.75 + 28,
        canMove: !!screen && setting('roam', true) && !a.busy,
        flying: leases.some((l) => l.owner !== ctx.id),
      };
    }

    function step(t, dt) {
      const speed = Number(setting('speedPct', 100)) / 100;
      let needFrames = false;
      for (const a of actors.values()) {
        const m = a.mind;
        const w = worldFor(a);
        // Someone above us holds the position (a throw still flying): we are not the one moving it.
        if (a.posLease && !a.posLease.active) {
          dropPosition(a);
          m.interrupt(t);
        }
        const r = m.update(t, dt * speed, w);
        if (r.event === 'wave') say(a, 'greet', 0.7);

        if (m.walking) {
          if (!a.posLease) {
            const lease = a.pet.channel('position').request({ priority: PRIORITY.resident, value: a.pet.position, preempt: false });
            a.posLease = lease;
            lease.onRevoked(() => {
              if (a.posLease === lease) a.posLease = null;
              a.mind.interrupt(now());
            });
          }
          if (r.moveTo !== null && a.posLease.active) a.posLease.update({ x: r.moveTo, y: a.pet.position.y });
          needFrames = true;
        } else {
          if (r.moveTo !== null && a.posLease?.active) a.posLease.update({ x: r.moveTo, y: a.pet.position.y });
          dropPosition(a);
          if (m.phase === 'turn') needFrames = true;
        }

        showState(a, r.state);
        setFlip(a, m.facing === -1 && !!a.stateKey && DIRECTIONAL.has(a.stateKey));

        if (t >= a.chatterAt) {
          a.chatterAt = t + between(rng, m.b.chatterMs);
          if (m.phase === 'rest' && m.pose === STATE.stand && !a.busy) say(a, 'idle');
        }
      }
      // Frame callbacks keep Petween rendering at full rate, so hold one only while someone walks.
      if (needFrames && !frameSub) frameSub = ctx.requestFrame((_, d) => step(now(), d));
      else if (!needFrames && frameSub) {
        frameSub.dispose();
        frameSub = null;
      }
    }

    // ---------- who is on the desktop ----------

    async function scaleOf(petId) {
      // PetHandle has no `scale` (apiVersion 1); the saved instances file is the only place to read it.
      try {
        const file = JSON.parse(await ctx.host.fs.readText(appFile('instances.json')));
        const inst = (file.pets ?? []).find((p) => p.id === petId);
        return Number.isFinite(inst?.scale) ? inst.scale : undefined;
      } catch {
        return undefined;
      }
    }

    async function reconcile() {
      if (reconciling) {
        again = true;
        return;
      }
      reconciling = true;
      try {
        const screen = ctx.desktop.screens()[0];
        for (const [i, id] of ROSTER.entries()) {
          const wanted = !!setting(`show.${id}`, true);
          const present = ctx.pets.list().filter((p) => characterOf(p)?.character === id);
          if (wanted && !present.length) {
            if (!(await ctx.host.fs.exists(appFile('pets', id, 'pet.json')))) {
              if (!warned.has(id)) ctx.log.warn(`pet pack "${id}" is not installed (expected ${appFile('pets', id)})`);
              warned.add(id);
              continue;
            }
            const seat = ctx.data.get(`seat.${id}`);
            const position =
              seat && Number.isFinite(seat.x) && Number.isFinite(seat.y) ? { x: seat.x, y: seat.y }
              : screen ? { x: screen.x + screen.width * (0.3 + 0.2 * i), y: screen.y + screen.height - 6 }
              : undefined;
            await ctx.pets.add({ pack: id, position, scale: seat?.scale ?? 1, persist: true });
          } else if (!wanted && present.length) {
            for (const pet of present) {
              const p = pet.position;
              const scale = (await scaleOf(pet.id)) ?? ctx.data.get(`seat.${id}`)?.scale ?? 1;
              ctx.data.set(`seat.${id}`, { x: Math.round(p.x), y: Math.round(p.y), scale });
              ctx.pets.remove(pet.id);
            }
          }
        }
      } catch (e) {
        ctx.log.error('reconcile failed', e);
      } finally {
        reconciling = false;
        if (again) {
          again = false;
          void reconcile();
        }
      }
    }

    // ---------- wiring ----------

    ctx.pets.list().forEach(attach);
    ctx.pets.on('added', attach);
    ctx.pets.on('removed', detach);

    const trayItems = ROSTER.map((id) =>
      ctx.tray.addItem({
        label: `Fantasy Trio：顯示 ${NAMES[id]}`,
        checked: !!setting(`show.${id}`, true),
        onClick: () => ctx.settings.set(`show.${id}`, !setting(`show.${id}`, true)),
      }),
    );
    ctx.settings.onChange((key) => {
      if (!key.startsWith('show.')) return;
      ROSTER.forEach((id, i) => trayItems[i].update({ checked: !!setting(`show.${id}`, true) }));
      void reconcile();
    });

    void reconcile().then(() => {
      // A hello from whoever is here, one after another.
      [...actors.values()].forEach((a, i) => ctx.setTimeout(() => say(a, 'greet'), 2500 + i * 1800));
    });

    ctx.setInterval(() => {
      if (!frameSub) step(now(), 0);
    }, TICK_MS);

    // For the settings page / debugging: what each character is doing.
    ctx.settingsPage.handle('status', () =>
      [...actors.values()].map((a) => ({ id: a.pet.id, character: a.cfg.character, phase: a.mind.phase, state: a.stateKey, facing: a.mind.facing, busy: a.busy, x: Math.round(a.pet.position.x) })),
    );
  },
};

const NAMES = { xiaomalei: '小馬蕾', fufu: '芙芙', freya: '芙蕾雅' };
