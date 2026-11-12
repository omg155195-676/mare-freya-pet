// What the stage needs from "something that draws one character". The stage (main.ts) only talks to
// this interface, so the WebGL stand-in (gl-figure.ts) and the Spine figure (pending/spine-figure.ts)
// are interchangeable, and the measurements compare like with like.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Figure {
  /** The element the stage positions (its bottom-centre is the character's feet). */
  readonly canvas: HTMLCanvasElement;
  /** Size of the canvas in CSS px. */
  readonly width: number;
  readonly height: number;
  readonly animations: string[];
  readonly skins: string[];

  setAnimation(name: string): void;
  setSkin(name: string): void;
  setPhysics(on: boolean): void;
  /** Point to look at, in canvas CSS px (origin top-left); null = look ahead. */
  lookAt(p: { x: number; y: number } | null): void;

  /** Advance by dt seconds and draw. */
  frame(dt: number): void;

  /** Visible box in canvas CSS px: the first, cheap hit test. */
  bounds(): Box;
  /** Precise test in canvas CSS px. Step 1 of the prototype may simply return true inside bounds(). */
  hit(x: number, y: number): boolean;

  dispose(): void;
}

export type FigureFactory = (index: number) => Promise<Figure>;
