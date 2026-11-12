// NOT ENABLED. NOT RUN. The Spine implementation of `Figure`, written ahead so the prototype can start
// the day the licence question is settled (see ./README.md). It is outside the build (tsconfig
// "exclude") and nothing imports it: the Spine Runtimes are not a dependency of this project yet.
//
// It was only type-checked, against @esotericsoftware/spine-webgl 4.3.13 kept outside the repository.
// Every behaviour below is unverified until it runs with a real skeleton in WebView2.
//
// The Spine Runtimes are proprietary (Spine Runtimes License Agreement). Using this file requires a
// valid Spine Editor licence (Essential or Professional; the Trial does not grant runtime use).

import {
  AnimationState,
  AnimationStateData,
  AssetManager,
  AtlasAttachmentLoader,
  Downloader,
  ManagedWebGLRenderingContext,
  Physics,
  SceneRenderer,
  Skeleton,
  SkeletonBinary,
  type SkeletonData,
  Skin,
  type TextureAtlas,
  Vector2,
} from '@esotericsoftware/spine-webgl';
import type { Box, Figure } from '../figure';

export interface SpineFigureOptions {
  /** Folder under public/ holding the export, e.g. 'spine/heroine/'. */
  path: string;
  /** e.g. 'heroine.skel' (binary export) and 'heroine.atlas' (packed with premultiplied alpha). */
  skeleton: string;
  atlas: string;
  /** Canvas size in CSS px. The skeleton is fitted into it with a margin for hair and raised arms. */
  width?: number;
  height?: number;
  /** Skins that are always worn (body, hair); the chosen outfit skin is added on top. */
  baseSkins?: string[];
  /** Skins offered as outfits; default = every skin whose name starts with 'outfit/'. */
  outfitPrefix?: string;
  /** A bone the rig aims the eyes / head at (IK or transform constraint target). */
  lookBone?: string;
  /** Looping animation layered on track 1 while it exists (kept independent of the body animation). */
  blinkAnimation?: string;
  defaultMix?: number;
}

// One download cache for every instance: the files are fetched once however many figures use them.
// GPU textures are still per WebGL context here (one context per figure). Sharing one context between
// figures is experiment B in the README.
const downloads = new Downloader();

export async function createSpineFigure(o: SpineFigureOptions): Promise<Figure> {
  const W = o.width ?? 420;
  const H = o.height ?? 760;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'figure';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const context = new ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: true });
  const assets = new AssetManager(context, o.path, downloads);
  assets.loadBinary(o.skeleton);
  assets.loadTextureAtlas(o.atlas);
  await assets.loadAll();

  const atlas = assets.require(o.atlas) as TextureAtlas;
  const data: SkeletonData = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(assets.require(o.skeleton) as Uint8Array);
  const skeleton = new Skeleton(data);
  const stateData = new AnimationStateData(data);
  stateData.defaultMix = o.defaultMix ?? 0.2; // bone blending between animations: no pop when switching
  const state = new AnimationState(stateData);

  const prefix = o.outfitPrefix ?? 'outfit/';
  const animations = data.animations.map((a) => a.name).filter((n) => n !== o.blinkAnimation);
  const skins = data.skins.map((s) => s.name).filter((n) => n.startsWith(prefix));
  let physics = true;
  let look: { x: number; y: number } | null = null;
  let box: Box = { x: 0, y: 0, w: 0, h: 0 };

  function wear(outfit: string | null) {
    const worn = new Skin('worn');
    for (const name of [...(o.baseSkins ?? []), ...(outfit ? [outfit] : [])]) {
      const s = data.findSkin(name);
      if (s) worn.addSkin(s);
    }
    skeleton.setSkin(worn);
    skeleton.setupPoseSlots(); // attachments of the new skin take effect; bones keep their pose
  }
  wear(skins[0] ?? null);
  skeleton.setupPose();
  if (animations.length) state.setAnimation(0, animations.includes('idle') ? 'idle' : animations[0], true);
  if (o.blinkAnimation && data.animations.some((a) => a.name === o.blinkAnimation)) state.setAnimation(1, o.blinkAnimation, true);
  state.apply(skeleton);
  skeleton.updateWorldTransform(Physics.pose);

  // Fit the setup pose into the canvas once; the camera then stays put so animations do not rescale.
  const renderer = new SceneRenderer(canvas, context);
  const fit = skeleton.getBoundsRect();
  const cam = renderer.camera;
  cam.setViewport(canvas.width, canvas.height);
  cam.zoom = Math.max(fit.width / canvas.width, fit.height / canvas.height) * 1.25;
  // feet (skeleton origin, y = 0) near the bottom edge of the canvas
  cam.position.set(fit.x + fit.width / 2, (canvas.height / 2) * cam.zoom - 12 * dpr * cam.zoom, 0);

  const toWorld = (x: number, y: number) => ({
    x: cam.position.x + (x - W / 2) * dpr * cam.zoom,
    y: cam.position.y - (y - H / 2) * dpr * cam.zoom,
  });
  const toCanvas = (x: number, y: number) => ({
    x: W / 2 + (x - cam.position.x) / (dpr * cam.zoom),
    y: H / 2 - (y - cam.position.y) / (dpr * cam.zoom),
  });
  const lookBone = o.lookBone ? skeleton.findBone(o.lookBone) : null;
  const tmp = new Vector2();

  const figure: Figure = {
    canvas,
    width: W,
    height: H,
    animations,
    skins,
    setAnimation: (name) => {
      if (animations.includes(name)) state.setAnimation(0, name, true);
    },
    setSkin: (name) => {
      if (skins.includes(name)) wear(name);
    },
    setPhysics: (on) => void (physics = on),
    lookAt: (p) => void (look = p),

    frame(dt) {
      state.update(dt);
      state.apply(skeleton);
      if (lookBone && look) {
        const w = toWorld(look.x, look.y);
        tmp.set(w.x, w.y);
        const local = lookBone.parent ? lookBone.parent.appliedPose.worldToLocal(tmp) : tmp;
        lookBone.pose.x = local.x;
        lookBone.pose.y = local.y;
      }
      skeleton.update(dt);
      skeleton.updateWorldTransform(physics ? Physics.update : Physics.none);

      const gl = context.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.begin();
      renderer.drawSkeleton(skeleton);
      renderer.end();

      const b = skeleton.getBoundsRect();
      const tl = toCanvas(b.x, b.y + b.height);
      const br = toCanvas(b.x + b.width, b.y);
      box = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
    },

    bounds: () => box,
    // Step 1 (agreed): the skeleton's bounding box. Step 2: bounding-box attachments drawn in the
    // editor (SkeletonBounds.containsPoint). Step 3: mesh triangles + an alpha mask of the atlas.
    hit: (x, y) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h,

    dispose() {
      renderer.dispose();
      assets.dispose();
      canvas.remove();
    },
  };
  return figure;
}
