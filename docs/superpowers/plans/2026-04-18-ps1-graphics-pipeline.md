# PS1 Graphics Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Phobos from flat-colored Minecraft blocks into PS1-authentic horror with procedural textures, vertex jitter, and CRT post-processing.

**Architecture:** Three independent, layered systems: (1) a `textures.ts` module that procedurally draws and caches canvas textures, (2) a `ps1Material.ts` utility that injects vertex jitter via `onBeforeCompile`, and (3) a `postProcessing.ts` module that runs a CRT shader pass via Three.js `EffectComposer`. Each scene's `makeProp`/`makeWall` helpers are updated to accept texture names and apply jitter.

**Tech Stack:** Three.js (existing), Canvas 2D API (procedural textures), GLSL (vertex jitter + CRT shader), Three.js EffectComposer/RenderPass/ShaderPass (postprocessing)

**Spec:** `docs/superpowers/specs/2026-04-18-ps1-graphics-pipeline-design.md`

---

### Task 1: Create the Procedural Texture Generator

**Files:**
- Create: `apps/web/src/game/textures.ts`

This is the foundation — all other tasks depend on it.

- [ ] **Step 1: Create `textures.ts` with the `TextureType` type and `getTexture()` function**

```ts
// apps/web/src/game/textures.ts
import * as THREE from 'three';

/** All available procedural texture types. */
export type TextureType =
  | 'concrete' | 'concrete_dark' | 'concrete_floor'
  | 'wallpaper' | 'wallpaper_torn'
  | 'wood_panel' | 'wood_floor'
  | 'wood_dark' | 'wood_light'
  | 'metal' | 'fabric' | 'plaster'
  | 'door' | 'brick';

/** Lazy cache — textures are created on first request and reused. */
const cache = new Map<TextureType, THREE.CanvasTexture>();

/**
 * Returns a cached procedural CanvasTexture for the given type.
 * All textures use NearestFilter (pixelated PS1 look) and RepeatWrapping
 * (seamless tiling on large surfaces).
 */
export function getTexture(type: TextureType): THREE.CanvasTexture {
  const cached = cache.get(type);
  if (cached) return cached;

  const draw = DRAW_FNS[type];
  const size = LARGE_TEXTURES.has(type) ? 128 : 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  cache.set(type, tex);
  return tex;
}

/** Textures rendered at 128×128 (walls, floors). Everything else is 64×64. */
const LARGE_TEXTURES = new Set<TextureType>([
  'concrete', 'concrete_dark', 'concrete_floor',
  'wallpaper', 'wallpaper_torn',
  'wood_panel', 'wood_floor',
  'plaster', 'brick',
]);

// ── Drawing helpers ──────────────────────────────────────────────────────────

/** Fill every pixel with random noise around a base color. */
function noisePass(ctx: CanvasRenderingContext2D, s: number, r: number, g: number, b: number, spread: number): void {
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    d[i]     = Math.max(0, Math.min(255, r + n));
    d[i + 1] = Math.max(0, Math.min(255, g + n));
    d[i + 2] = Math.max(0, Math.min(255, b + n));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Draw thin random crack lines. */
function crackPass(ctx: CanvasRenderingContext2D, s: number, color: string, count: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    let x = Math.random() * s;
    let y = Math.random() * s;
    ctx.moveTo(x, y);
    const segs = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < segs; j++) {
      x += (Math.random() - 0.5) * 20;
      y += (Math.random() - 0.5) * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Draw horizontal grain lines for wood textures. */
function grainPass(ctx: CanvasRenderingContext2D, s: number, color: string, spacing: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let y = 0; y < s; y += spacing + Math.random() * 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < s; x += 4) {
      ctx.lineTo(x, y + (Math.random() - 0.5) * 1.5);
    }
    ctx.stroke();
  }
}

// ── Per-type draw functions ──────────────────────────────────────────────────

type DrawFn = (ctx: CanvasRenderingContext2D, s: number) => void;

const DRAW_FNS: Record<TextureType, DrawFn> = {
  concrete(ctx, s) {
    noisePass(ctx, s, 100, 95, 88, 30);
    crackPass(ctx, s, 'rgba(40,35,30,0.5)', 3);
  },

  concrete_dark(ctx, s) {
    noisePass(ctx, s, 60, 55, 50, 25);
    crackPass(ctx, s, 'rgba(30,25,20,0.6)', 4);
    // Damp stain blotches
    ctx.fillStyle = 'rgba(40,50,45,0.15)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 15, 8 + Math.random() * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  concrete_floor(ctx, s) {
    noisePass(ctx, s, 85, 80, 75, 25);
    crackPass(ctx, s, 'rgba(40,35,30,0.4)', 2);
    // Expansion joint grid lines
    ctx.strokeStyle = 'rgba(50,45,40,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();
  },

  wallpaper(ctx, s) {
    // Faded base color
    ctx.fillStyle = '#6a5a68';
    ctx.fillRect(0, 0, s, s);
    noisePass(ctx, s, 106, 90, 104, 15);
    // Vertical stripe pattern
    ctx.strokeStyle = 'rgba(80,60,75,0.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x < s; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
  },

  wallpaper_torn(ctx, s) {
    // Draw base wallpaper first
    DRAW_FNS.wallpaper(ctx, s);
    // Rectangular torn regions revealing darker wall
    ctx.fillStyle = 'rgba(35,30,35,0.8)';
    for (let i = 0; i < 2; i++) {
      const rx = Math.random() * s * 0.6;
      const ry = Math.random() * s * 0.6;
      ctx.fillRect(rx, ry, 15 + Math.random() * 25, 20 + Math.random() * 30);
    }
  },

  wood_panel(ctx, s) {
    noisePass(ctx, s, 70, 55, 35, 20);
    // Vertical plank dividers
    ctx.strokeStyle = 'rgba(30,22,12,0.5)';
    ctx.lineWidth = 1;
    const plankW = s / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * plankW, 0);
      ctx.lineTo(i * plankW, s);
      ctx.stroke();
    }
    grainPass(ctx, s, 'rgba(50,38,22,0.2)', 4);
  },

  wood_floor(ctx, s) {
    noisePass(ctx, s, 75, 58, 38, 18);
    // Horizontal plank dividers with alternating widths
    ctx.strokeStyle = 'rgba(40,28,15,0.5)';
    ctx.lineWidth = 1;
    let y = 0;
    let even = true;
    while (y < s) {
      const h = even ? s / 3 : s / 4;
      y += h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      even = !even;
    }
    grainPass(ctx, s, 'rgba(55,40,22,0.15)', 5);
  },

  wood_dark(ctx, s) {
    noisePass(ctx, s, 45, 33, 22, 18);
    grainPass(ctx, s, 'rgba(30,20,10,0.3)', 4);
    // Occasional knot
    ctx.fillStyle = 'rgba(25,18,10,0.4)';
    ctx.beginPath();
    ctx.ellipse(s * 0.3, s * 0.6, 4, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
  },

  wood_light(ctx, s) {
    noisePass(ctx, s, 130, 110, 80, 20);
    grainPass(ctx, s, 'rgba(90,72,45,0.2)', 5);
  },

  metal(ctx, s) {
    noisePass(ctx, s, 80, 82, 85, 15);
    // Horizontal brushed lines
    ctx.strokeStyle = 'rgba(100,102,105,0.2)';
    ctx.lineWidth = 1;
    for (let y = 0; y < s; y += 2) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
    // Tarnish/rust spots
    ctx.fillStyle = 'rgba(100,60,30,0.2)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  fabric(ctx, s) {
    noisePass(ctx, s, 90, 55, 60, 15);
    // Cross-hatch weave
    ctx.strokeStyle = 'rgba(70,40,45,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i < s; i += 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
  },

  plaster(ctx, s) {
    noisePass(ctx, s, 55, 50, 48, 20);
    // Stippled rough texture
    ctx.fillStyle = 'rgba(40,36,34,0.15)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    crackPass(ctx, s, 'rgba(30,26,24,0.3)', 2);
  },

  door(ctx, s) {
    noisePass(ctx, s, 55, 40, 28, 15);
    grainPass(ctx, s, 'rgba(35,25,15,0.25)', 5);
    // Panel inset rectangle
    ctx.strokeStyle = 'rgba(30,20,12,0.5)';
    ctx.lineWidth = 2;
    const m = s * 0.15;
    ctx.strokeRect(m, m, s - m * 2, s * 0.4);
    ctx.strokeRect(m, s * 0.55, s - m * 2, s * 0.3);
  },

  brick(ctx, s) {
    ctx.fillStyle = '#4a3028';
    ctx.fillRect(0, 0, s, s);
    const brickH = s / 8;
    const brickW = s / 4;
    ctx.strokeStyle = 'rgba(80,70,60,0.4)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 8; row++) {
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      for (let col = -1; col < 5; col++) {
        const bx = col * brickW + offset;
        const by = row * brickH;
        // Per-brick color variation
        const v = (Math.random() - 0.5) * 20;
        ctx.fillStyle = `rgb(${74 + v},${48 + v},${40 + v})`;
        ctx.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);
      }
      // Mortar lines (horizontal)
      ctx.beginPath(); ctx.moveTo(0, row * brickH); ctx.lineTo(s, row * brickH); ctx.stroke();
    }
  },
};
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep textures`
Expected: No errors mentioning `textures.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/textures.ts
git commit -m "feat: procedural texture generator with 14 PS1-style texture types"
```

---

### Task 2: Create the Vertex Jitter Utility

**Files:**
- Create: `apps/web/src/game/ps1Material.ts`

- [ ] **Step 1: Create `ps1Material.ts` with `applyPS1Jitter()`**

```ts
// apps/web/src/game/ps1Material.ts
import * as THREE from 'three';

/**
 * The render-target resolution, used by the vertex jitter shader to convert
 * clip-space coordinates into pixel coordinates for grid-snapping. Defaults
 * to a common half-res target; call `setJitterResolution()` after engine
 * init and on every resize to keep it accurate.
 */
const jitterResolution = new THREE.Vector2(960, 540);

/**
 * Update the resolution used by all jittered materials. Call this once after
 * engine init and again in the window resize handler.
 */
export function setJitterResolution(w: number, h: number): void {
  jitterResolution.set(w, h);
}

/**
 * Patch a MeshLambertMaterial with PS1-style vertex jitter.
 *
 * How it works:
 *   After the standard MVP transform places the vertex in clip space
 *   (gl_Position), we convert to screen-pixel coordinates, snap to a
 *   configurable grid (default 2px), then convert back. This recreates
 *   the PS1's lack of sub-pixel vertex precision — geometry "pops"
 *   between grid positions as the camera moves, producing the classic
 *   shimmer/wobble.
 *
 * The `onBeforeCompile` hook injects GLSL after Three.js's
 * `#include <project_vertex>` chunk, so all built-in lighting, fog,
 * and normal calculations still work untouched.
 *
 * @param material  The MeshLambertMaterial to patch.
 * @param gridSize  Snap grid in pixels. 2.0 = subtle wobble (default).
 *                  Higher values = more aggressive jitter.
 */
export function applyPS1Jitter(material: THREE.MeshLambertMaterial, gridSize = 2.0): void {
  material.onBeforeCompile = (shader) => {
    // Inject uniforms
    shader.uniforms.uResolution = { value: jitterResolution };
    shader.uniforms.uGridSize = { value: gridSize };

    // Inject the grid-snap code after the vertex projection
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      /* glsl */ `
      #include <project_vertex>

      // ── PS1 vertex jitter ──────────────────────────────────────
      // Snap projected vertex position to a pixel grid to simulate
      // the PS1's integer-coordinate vertex rasterisation.
      {
        vec2 res = uResolution;
        float grid = uGridSize;
        // Clip → NDC
        vec2 ndc = gl_Position.xy / gl_Position.w;
        // NDC → pixel coordinates
        vec2 pixel = (ndc * 0.5 + 0.5) * res;
        // Snap to grid
        pixel = floor(pixel / grid) * grid;
        // Pixel → NDC
        ndc = (pixel / res) * 2.0 - 1.0;
        // Write back, preserving w
        gl_Position.xy = ndc * gl_Position.w;
      }
      `,
    );

    // Declare the uniforms at the top of the vertex shader
    shader.vertexShader = 'uniform vec2 uResolution;\nuniform float uGridSize;\n' + shader.vertexShader;
  };

  // Force Three.js to recognise this as a unique shader variant
  // so it compiles + caches the patched program.
  (material as any).customProgramCacheKey = () => 'ps1-jitter';
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep ps1Material`
Expected: No errors mentioning `ps1Material.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/ps1Material.ts
git commit -m "feat: PS1 vertex jitter via onBeforeCompile grid-snap"
```

---

### Task 3: Create the CRT Post-Processing Module

**Files:**
- Create: `apps/web/src/game/postProcessing.ts`

- [ ] **Step 1: Create `postProcessing.ts` with `createCRTComposer()`**

```ts
// apps/web/src/game/postProcessing.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Custom CRT shader — four effects in a single fragment pass:
 *
 *   1. Chromatic aberration — R/G/B channels sampled at offset UVs,
 *      simulating a cheap CRT tube with imperfect beam convergence.
 *   2. Scanlines — alternating dark horizontal lines tied to screen Y,
 *      the defining visual signature of a CRT display.
 *   3. Vignette — radial darkening at screen edges, focuses the player's
 *      eye and hides edge geometry. Classic horror framing.
 *   4. Film grain — per-frame random noise overlay that adds analog
 *      texture to every pixel. Never static (driven by uTime).
 *
 * All effect strengths are exposed as uniforms so the scare director /
 * event system can ramp them dynamically:
 *   - uAberrationStrength ramps during scare events (0.003 → 0.01)
 *   - uGrainIntensity scales with fear_score (0.06 → 0.15)
 *   - uScanlineWeight pulses during TV-static moments
 *   - uVignetteRadius tightens for tunnel vision (0.85 → 0.6)
 */
const CRTShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(960, 540) },
    uScanlineWeight: { value: 0.08 },
    uVignetteRadius: { value: 0.85 },
    uAberrationStrength: { value: 0.003 },
    uGrainIntensity: { value: 0.06 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uScanlineWeight;
    uniform float uVignetteRadius;
    uniform float uAberrationStrength;
    uniform float uGrainIntensity;

    varying vec2 vUv;

    void main() {
      // ── 1. Chromatic aberration ──
      // Sample R/G/B at horizontally offset UVs. The offset increases
      // toward screen edges for a more natural CRT look.
      float edgeDist = abs(vUv.x - 0.5) * 2.0;
      float aberr = uAberrationStrength * (1.0 + edgeDist);
      float r = texture2D(tDiffuse, vUv + vec2(aberr, 0.0)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - vec2(aberr, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // ── 2. Scanlines ──
      // Sine wave tied to pixel row. At half-res (~540 rows) this
      // produces visible but not overwhelming horizontal banding.
      float scanline = sin(vUv.y * uResolution.y * 3.14159) * 0.5 + 0.5;
      color *= mix(1.0, scanline, uScanlineWeight);

      // ── 3. Vignette ──
      // Radial darkening from center. smoothstep gives a soft falloff.
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(uVignetteRadius, uVignetteRadius - 0.25, dist);
      color *= vignette;

      // ── 4. Film grain ──
      // Classic pseudo-random hash driven by UV + time so each frame
      // gets a different noise pattern. Subtle at default 0.06 intensity.
      float grain = fract(sin(dot(vUv * uTime + vec2(uTime * 0.1, uTime * 0.07), vec2(12.9898, 78.233))) * 43758.5453);
      color += (grain - 0.5) * uGrainIntensity;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/** Uniforms handle for external code to drive CRT effects dynamically. */
export interface CRTUniformsHandle {
  uTime: { value: number };
  uResolution: { value: THREE.Vector2 };
  uScanlineWeight: { value: number };
  uVignetteRadius: { value: number };
  uAberrationStrength: { value: number };
  uGrainIntensity: { value: number };
}

/**
 * Create an EffectComposer with the CRT post-processing pipeline.
 *
 * Pipeline order:
 *   1. RenderPass — renders the 3D scene to a texture
 *   2. ShaderPass (CRT) — applies scanlines, vignette, aberration, grain
 *   3. OutputPass — handles color space conversion for final output
 *
 * @returns The composer (call `composer.render()` instead of
 *          `renderer.render()`) and a uniforms handle for dynamic control.
 */
export function createCRTComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): { composer: EffectComposer; uniforms: CRTUniformsHandle } {
  const composer = new EffectComposer(renderer);

  // Pass 1: Render the 3D scene
  composer.addPass(new RenderPass(scene, camera));

  // Pass 2: CRT effects
  const crtPass = new ShaderPass(CRTShader);
  composer.addPass(crtPass);

  // Pass 3: Output (color space conversion)
  composer.addPass(new OutputPass());

  const uniforms = crtPass.uniforms as unknown as CRTUniformsHandle;
  return { composer, uniforms };
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep postProcessing`
Expected: No errors mentioning `postProcessing.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/game/postProcessing.ts
git commit -m "feat: CRT post-processing — scanlines, vignette, aberration, grain"
```

---

### Task 4: Wire CRT Composer into the Engine

**Files:**
- Modify: `apps/web/src/game/engine.ts`

- [ ] **Step 1: Add imports and composer fields**

At the top of `engine.ts`, add the import:

```ts
import { createCRTComposer, type CRTUniformsHandle } from './postProcessing';
import { setJitterResolution } from './ps1Material';
```

Add fields to the `Engine` class (after the existing `private hemi` field):

```ts
  /** CRT post-processing composer — replaces direct renderer.render(). */
  private composer!: EffectComposer;
  /** Exposed CRT uniforms for scare-director dynamic control. */
  crtUniforms!: CRTUniformsHandle;
```

Note: `EffectComposer` needs to be imported too:

```ts
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
```

- [ ] **Step 2: Create the composer in the constructor**

At the end of the constructor (after `this.eventBus = new EventBus(...)`, before the resize listener), add:

```ts
    // ── CRT post-processing ──────────────────────────────────────────
    const { composer, uniforms } = createCRTComposer(this.renderer, this.scene, this.camera);
    this.composer = composer;
    this.crtUniforms = uniforms;

    // Set the render resolution for the vertex jitter shader.
    const w = Math.floor(window.innerWidth / 2);
    const h = Math.floor(window.innerHeight / 2);
    setJitterResolution(w, h);
    this.crtUniforms.uResolution.value.set(w, h);
```

- [ ] **Step 3: Switch animate() to use the composer**

In the `animate` method, replace:

```ts
    this.renderer.render(this.scene, this.camera);
```

with:

```ts
    // Update CRT time uniform (drives film grain animation)
    this.crtUniforms.uTime.value = performance.now() * 0.001;
    this.composer.render();
```

- [ ] **Step 4: Update the resize handler**

In the `onResize` method, after the existing `this.renderer.setSize(...)` call, add:

```ts
    // Keep composer and jitter shader in sync with new resolution.
    const rw = Math.floor(window.innerWidth / 2);
    const rh = Math.floor(window.innerHeight / 2);
    this.composer.setSize(rw, rh);
    setJitterResolution(rw, rh);
    this.crtUniforms.uResolution.value.set(rw, rh);
```

- [ ] **Step 5: Verify it compiles and renders**

Run: `npx tsc --noEmit --pretty 2>&1 | grep engine`
Expected: No errors mentioning `engine.ts`

Run: `npm run dev`
Expected: Game renders with CRT effects visible — scanlines, darkened edges, slight grain noise. Geometry still has flat solid colors (textures come next).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/game/engine.ts
git commit -m "feat: wire CRT post-processing into engine render loop"
```

---

### Task 5: Update Basement Scene — Textures + Jitter

**Files:**
- Modify: `apps/web/src/game/scenes/basement.ts`

- [ ] **Step 1: Add imports**

At the top of `basement.ts`, add:

```ts
import { getTexture, type TextureType } from '../textures';
import { applyPS1Jitter } from '../ps1Material';
```

- [ ] **Step 2: Update `makeWall` to accept textures and apply jitter**

Replace the existing `makeWall` method (currently at the bottom of the file) with:

```ts
  private makeWall(w: number, h: number, p: THREE.Vector3, r: THREE.Euler, appearance: number | TextureType): THREE.Mesh {
    const mat = typeof appearance === 'string'
      ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true, side: THREE.FrontSide })
      : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true, side: THREE.FrontSide });
    applyPS1Jitter(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(p);
    mesh.rotation.copy(r);
    return mesh;
  }
```

- [ ] **Step 3: Update `makeProp` to accept textures and apply jitter**

Replace the existing `makeProp` method with:

```ts
  private makeProp(w: number, h: number, d: number, p: THREE.Vector3, appearance: number | TextureType): THREE.Mesh {
    const mat = typeof appearance === 'string'
      ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true })
      : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true });
    applyPS1Jitter(mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.copy(p);
    return mesh;
  }
```

- [ ] **Step 4: Replace wall hex colors with texture types**

In the `load()` method, update the shell walls (lines 99-104):

```ts
    // ── shell (concrete) ───────────────────────────────────────────────
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 'concrete_floor'));
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 'plaster'));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 'concrete'));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 'concrete'));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 'concrete_dark'));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 'concrete_dark'));
```

- [ ] **Step 5: Replace key prop hex colors with texture types**

Update the major props. Replace hex colors with texture strings for crate, shelves, stairs, pipes, and TV stand. Small detail props (cord, screws, thin strips) keep hex colors.

Key replacements in `load()`:
- Crate (`0x2a1f14`) → `'wood_dark'`
- Crate lid rim (`0x180f08`) → `'wood_dark'`
- Stair treads (`0x1e1610`) → `'wood_dark'`
- Stair risers (`0x120c08`) → `'wood_dark'`
- Stair stringers (`0x0e0806`) → `'wood_dark'`
- Stair landing (`0x1d1511`) → `'wood_dark'`
- Shelf boards (`0x3a2a1a`) → `'wood_dark'`
- Pipe segments (`0x4a4a4a` or similar grey) → `'metal'`
- Workbench top/legs → `'wood_dark'`
- Chair seat/back → `'wood_dark'`

In `buildStairs()`, replace the hex colors:
```ts
    // tread
    this.group.add(this.makeProp(1.0, 0.04, 0.32, new THREE.Vector3(x, 0.16 + i * 0.2, zStart + i * 0.32), 'wood_dark'));
    // riser
    this.group.add(this.makeProp(1.0, 0.2, 0.04, new THREE.Vector3(x, 0.1 + i * 0.2, zStart + i * 0.32 - 0.14), 'wood_dark'));
```

And the stringers, landing, and door frame posts.

- [ ] **Step 6: Verify it compiles and renders**

Run: `npx tsc --noEmit --pretty 2>&1 | grep basement`
Expected: No errors

Run: `npm run dev` → navigate to basement
Expected: Walls show concrete textures, floor has expansion joints, crate/stairs have wood grain, all geometry wobbles slightly as camera moves. CRT overlay on top of everything.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/game/scenes/basement.ts
git commit -m "feat: basement scene — procedural textures + vertex jitter"
```

---

### Task 6: Update Bedroom Scene — Textures + Jitter

**Files:**
- Modify: `apps/web/src/game/scenes/bedroom.ts`

- [ ] **Step 1: Add imports**

```ts
import { getTexture, type TextureType } from '../textures';
import { applyPS1Jitter } from '../ps1Material';
```

- [ ] **Step 2: Update `makeWall` and `makeProp` (same pattern as basement)**

Replace `makeWall`:

```ts
  private makeWall(w: number, h: number, p: THREE.Vector3, r: THREE.Euler, appearance: number | TextureType): THREE.Mesh {
    const mat = typeof appearance === 'string'
      ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true, side: THREE.FrontSide })
      : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true, side: THREE.FrontSide });
    applyPS1Jitter(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(p);
    mesh.rotation.copy(r);
    return mesh;
  }
```

Replace `makeProp`:

```ts
  private makeProp(w: number, h: number, d: number, p: THREE.Vector3, appearance: number | TextureType): THREE.Mesh {
    const mat = typeof appearance === 'string'
      ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true })
      : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true });
    applyPS1Jitter(mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.copy(p);
    return mesh;
  }
```

- [ ] **Step 3: Replace wall hex colors with texture types**

In the `load()` method, update the shell walls (lines 94-99):

```ts
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 'wood_floor'));
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 'plaster'));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 'wallpaper'));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 'wallpaper'));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 'wallpaper_torn'));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 'wallpaper'));
```

- [ ] **Step 4: Replace key prop hex colors with texture types**

Key replacements:
- Bed frame/headboard/footboard → `'wood_light'`
- Nightstand → `'wood_light'`
- Wardrobe body/door → `'wood_dark'`
- Entry door → `'door'`
- Chair seat/legs → `'wood_light'`
- Baseboards → keep hex (thin trim detail)
- Rug material → `'fabric'` (update the `buildRug` method's MeshLambertMaterial)
- Curtains → `'fabric'`
- Sheets/blanket → `'fabric'`

- [ ] **Step 5: Verify and visual check**

Run: `npx tsc --noEmit --pretty 2>&1 | grep bedroom`
Expected: No errors

Run: `npm run dev` → navigate to bedroom
Expected: Wallpaper pattern on walls, wood floor, fabric textures on rug/curtains, wood grain on furniture. Jitter + CRT active.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/game/scenes/bedroom.ts
git commit -m "feat: bedroom scene — procedural textures + vertex jitter"
```

---

### Task 7: Update Attic Scene — Textures + Jitter

**Files:**
- Modify: `apps/web/src/game/scenes/attic.ts`

- [ ] **Step 1: Add imports**

```ts
import { getTexture, type TextureType } from '../textures';
import { applyPS1Jitter } from '../ps1Material';
```

- [ ] **Step 2: Update `makeWall` and `makeProp` (same pattern)**

Replace `makeWall`:

```ts
  private makeWall(w: number, h: number, p: THREE.Vector3, r: THREE.Euler, appearance: number | TextureType): THREE.Mesh {
    const mat = typeof appearance === 'string'
      ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true, side: THREE.FrontSide })
      : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true, side: THREE.FrontSide });
    applyPS1Jitter(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(p);
    mesh.rotation.copy(r);
    return mesh;
  }
```

Replace `makeProp`:

```ts
  private makeProp(w: number, h: number, d: number, p: THREE.Vector3, appearance: number | TextureType): THREE.Mesh {
    const mat = typeof appearance === 'string'
      ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true })
      : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true });
    applyPS1Jitter(mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.copy(p);
    return mesh;
  }
```

- [ ] **Step 3: Replace wall hex colors with texture types**

In the `load()` method, update the shell walls (lines 75-80):

```ts
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 'wood_floor'));
    this.group.add(this.makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), 'wood_panel'));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), 'wood_panel'));
    this.group.add(this.makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), 'wood_panel'));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), 'wood_panel'));
    this.group.add(this.makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), 'wood_panel'));
```

- [ ] **Step 4: Replace key prop hex colors with texture types**

Key replacements:
- Cardboard boxes → `'wood_dark'` (close enough for cardboard at PS1 res)
- Box stack tape → keep hex (thin detail)
- Rafter beams → `'wood_dark'`
- Draped sheets/fabric → `'fabric'`
- Hatch frame material (the inline `hatchFrameMat`) → add `map: getTexture('metal')` to existing material
- Floor planks (the inline `plankMat`) → add `map: getTexture('wood_floor')` to existing material

- [ ] **Step 5: Verify and visual check**

Run: `npx tsc --noEmit --pretty 2>&1 | grep attic`
Expected: No errors

Run: `npm run dev` → navigate to attic
Expected: Wood panel walls, wood floor, fabric draped shapes. Jitter + CRT active.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/game/scenes/attic.ts
git commit -m "feat: attic scene — procedural textures + vertex jitter"
```

---

### Task 8: Final Integration + Visual Tuning

**Files:**
- Possibly modify: `apps/web/src/game/engine.ts`, `apps/web/src/game/textures.ts`, `apps/web/src/game/postProcessing.ts`

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: Only the pre-existing `entityManager.ts` unused-variable warning. No new errors.

- [ ] **Step 2: Visual smoke test — all three scenes**

Run: `npm run dev`

Walk through all three scenes and verify:
- **Basement**: Concrete walls with cracks, concrete floor with grid joints, wood-grain crate/stairs, metal pipes. Vertex wobble visible. CRT scanlines + grain overlay.
- **Bedroom**: Striped wallpaper (torn variant behind wardrobe), wood floor planks, fabric rug/curtains, wood furniture. Same effects.
- **Attic**: Wood panel walls, wood floor, fabric draped shapes, wood box stacks. Same effects.
- **All scenes**: Fog still works, lights still flicker, interactables still function, corner box overlay unaffected.

- [ ] **Step 3: Tune CRT defaults if needed**

If scanlines are too strong or grain is too visible, adjust defaults in `postProcessing.ts`:
- `uScanlineWeight`: default `0.08` — try `0.05` if too dark
- `uGrainIntensity`: default `0.06` — try `0.04` if too noisy
- `uAberrationStrength`: default `0.003` — try `0.002` if too split
- `uVignetteRadius`: default `0.85` — try `0.9` if edges are too dark

- [ ] **Step 4: Tune jitter grid size if needed**

If vertex wobble is too subtle or too aggressive, adjust in `ps1Material.ts`:
- Default grid size `2.0` — try `3.0` for more pronounced PS1 wobble
- Or `1.5` for subtler shimmer

- [ ] **Step 5: Commit final tuning**

```bash
git add -u
git commit -m "chore: tune CRT + jitter defaults for visual balance"
```
