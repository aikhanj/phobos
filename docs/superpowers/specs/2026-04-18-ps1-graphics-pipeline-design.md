# PS1 Graphics Pipeline — Design Spec

## Problem

Every wall, floor, and prop in Phobos is a `BoxGeometry` with a single flat hex color — no textures. Combined with `flatShading: true`, this makes the game look like Minecraft rather than PS1 horror. Real PS1 games (Silent Hill, Resident Evil) had low-resolution textures, vertex precision artifacts, and CRT display characteristics that created a distinctive uncanny aesthetic.

## Goal

Transform the visual identity from "solid-color blocks" to "PS1-authentic horror" by adding three layered systems:

1. **Procedural textures** on all surfaces (walls, floors, props)
2. **Vertex jitter shader** (PS1 grid-snap wobble)
3. **CRT post-processing** (scanlines, vignette, chromatic aberration, film grain)

Each layer is independent and testable in isolation.

## Non-Goals

- Photorealism or PBR materials
- Loaded image textures or asset pipeline (everything is procedural canvas)
- Shadow mapping
- Affine texture warping (possible future addition but not in scope)
- Changes to game logic, scenes, or audio

---

## System 1: Procedural Texture Generator

### New file: `apps/web/src/game/textures.ts`

A module that procedurally draws textures on offscreen `<canvas>` elements and returns cached `THREE.CanvasTexture` instances.

### API

```ts
type TextureType =
  | 'concrete' | 'concrete_dark' | 'concrete_floor'
  | 'wallpaper' | 'wallpaper_torn'
  | 'wood_panel' | 'wood_floor'
  | 'wood_dark' | 'wood_light'
  | 'metal' | 'fabric' | 'plaster'
  | 'door' | 'brick';

function getTexture(type: TextureType): THREE.CanvasTexture;
```

### Texture Specifications

All textures:
- Canvas size: 64×64 (props, small surfaces) or 128×128 (walls, floors)
- `magFilter: THREE.NearestFilter` — pixelated upscale, no bilinear smoothing
- `minFilter: THREE.NearestFilter` — same for downscale
- `wrapS/wrapT: THREE.RepeatWrapping` — seamless tiling
- `colorSpace: THREE.SRGBColorSpace`

Texture drawing techniques (all procedural via Canvas 2D API):
- **concrete**: Random pixel noise over a grey base, sparse dark crack lines
- **concrete_dark**: Same as concrete but darker base, random damp-stain blotches
- **concrete_floor**: Concrete base with faint grid lines (expansion joints)
- **wallpaper**: Repeating vertical stripe pattern over a faded color base
- **wallpaper_torn**: Wallpaper with rectangular cutout regions revealing darker wall underneath
- **wood_panel**: Vertical grain lines with subtle color variation between planks
- **wood_floor**: Horizontal grain lines, alternating plank widths, worn spots
- **wood_dark**: Dark wood grain, knot details, used for furniture/crates
- **wood_light**: Lighter variant of wood grain
- **metal**: Horizontal brushed-metal lines, dark spots for tarnish/rust
- **fabric**: Cross-hatch weave pattern, subtle color variation
- **plaster**: Rough stippled noise, occasional crack lines
- **door**: Rectangular panel inset lines over wood grain base
- **brick**: Offset rectangular grid with mortar lines, color variation per brick

### Caching

`getTexture()` returns the same `CanvasTexture` instance for repeated calls with the same type. Textures are created lazily on first request.

### Integration with existing code

The `makeProp` and `makeWall` helpers in each scene file are updated to accept either a hex color number (backwards compatible) or a `TextureType` string:

```ts
// Before:
private makeProp(w: number, h: number, d: number, p: THREE.Vector3, color: number): THREE.Mesh

// After:
private makeProp(w: number, h: number, d: number, p: THREE.Vector3, appearance: number | TextureType): THREE.Mesh
```

When `appearance` is a string, the helper calls `getTexture(appearance)` and creates a `MeshLambertMaterial` with the `map` property set. The material retains `flatShading: true`. A base `color` tint is derived from the texture type to maintain the scene's existing color palette under lighting (e.g., `wood_dark` gets a `0x2a1f14` tint multiplied with the texture).

Each scene's `load()` method is updated to replace hex color arguments with texture type strings for walls, floors, and key props. Not every single prop needs a texture — small detail props (screws, hinges, thin strips) can keep solid colors.

### Texture assignment by scene

**Basement:**
- Walls: `concrete` (main), `concrete_dark` (stair wall), `brick` (accent patches)
- Floor: `concrete_floor`
- Ceiling: `plaster`
- Props: `wood_dark` (crate, shelves, stairs), `metal` (pipes, TV stand)

**Bedroom:**
- Walls: `wallpaper` (main), `wallpaper_torn` (behind wardrobe)
- Floor: `wood_floor`
- Ceiling: `plaster`
- Props: `wood_light` (bed, nightstand, chair), `wood_dark` (wardrobe, door), `fabric` (curtains, rug, sheets)

**Attic:**
- Walls: `wood_panel`
- Floor: `wood_floor`
- Ceiling: `wood_panel` (exposed rafters match walls)
- Props: `wood_dark` (boxes, frames), `fabric` (draped sheets), `metal` (hatch frame)

---

## System 2: Vertex Jitter Shader

### New file: `apps/web/src/game/ps1Material.ts`

A utility that patches `MeshLambertMaterial` instances with PS1 vertex jitter via `onBeforeCompile`.

### API

```ts
function applyPS1Jitter(material: THREE.MeshLambertMaterial, resolution?: THREE.Vector2): void;
```

### How it works

`onBeforeCompile` injects GLSL at the end of `MeshLambertMaterial`'s vertex shader (after the `#include <project_vertex>` chunk). The injected code:

1. Takes `gl_Position` (already in clip space after MVP transform)
2. Converts to normalized device coordinates: `ndc = gl_Position.xy / gl_Position.w`
3. Maps to pixel coordinates: `pixel = ndc * 0.5 * uResolution + 0.5 * uResolution`
4. Snaps to grid: `pixel = floor(pixel / uGridSize) * uGridSize`
5. Maps back to NDC and reconstructs `gl_Position`

### Uniforms

- `uResolution: vec2` — render target size (e.g., 960×540 at half-res). Updated on resize.
- `uGridSize: float` — snap grid size in pixels. Default `2.0` (subtle wobble). Higher = more aggressive jitter.

### Integration

The `makeProp` and `makeWall` helpers call `applyPS1Jitter(material)` on every material they create. The resolution uniform is set once from the engine's render target size and updated on window resize.

Materials that should NOT jitter (UI elements, the lantern flame/halo, canvas-textured overlays like the chalk circle) skip the call.

### Performance note

`onBeforeCompile` causes Three.js to create a new shader program for jittered materials (separate from non-jittered). Since all jittered materials share the same patch, Three.js caches and reuses the compiled program. No per-frame cost beyond the extra vertex shader instructions (negligible — just floor + multiply).

---

## System 3: CRT Post-Processing

### New file: `apps/web/src/game/postProcessing.ts`

Sets up a Three.js `EffectComposer` with a custom CRT shader pass.

### API

```ts
interface CRTUniforms {
  uTime: number;
  uScanlineWeight: number;
  uVignetteRadius: number;
  uAberrationStrength: number;
  uGrainIntensity: number;
}

function createCRTComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): { composer: EffectComposer; uniforms: CRTUniforms };
```

### Dependencies

Requires three addons (already available in the three.js package):
- `three/addons/postprocessing/EffectComposer.js`
- `three/addons/postprocessing/RenderPass.js`
- `three/addons/postprocessing/ShaderPass.js`

### CRT Shader

A single fragment shader with four effects:

**Scanlines:**
```glsl
float scanline = sin(uv.y * uResolution.y * PI) * 0.5 + 0.5;
color *= mix(1.0, scanline, uScanlineWeight); // default weight ~0.08
```

**Vignette:**
```glsl
float dist = distance(uv, vec2(0.5));
float vignette = smoothstep(uVignetteRadius, uVignetteRadius - 0.25, dist);
color *= vignette; // default radius ~0.85
```

**Chromatic aberration:**
```glsl
float r = texture2D(tDiffuse, uv + vec2(uAberrationStrength, 0.0)).r;
float g = texture2D(tDiffuse, uv).g;
float b = texture2D(tDiffuse, uv - vec2(uAberrationStrength, 0.0)).b;
color = vec3(r, g, b); // default strength ~0.003
```

**Film grain:**
```glsl
float grain = fract(sin(dot(uv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
color += (grain - 0.5) * uGrainIntensity; // default intensity ~0.06
```

### Engine integration

In `engine.ts`:
- Create the composer in the constructor after setting up the renderer, scene, and camera
- Store the uniforms reference
- In the render loop: update `uTime`, then call `composer.render()` instead of `renderer.render()`
- On window resize: update `composer.setSize()` alongside `renderer.setSize()`

### Horror integration

The CRT uniforms are exposed so the scare director / event system can drive them:
- `uAberrationStrength`: ramps from 0.003 → 0.01 during scare events
- `uGrainIntensity`: scales with `fear_score` (0.06 base → 0.15 at max fear)
- `uScanlineWeight`: pulses heavier during TV-static moments
- `uVignetteRadius`: tightens from 0.85 → 0.6 during high tension (tunnel vision)

These can be driven from `SceneConfig` lerping or direct event triggers.

---

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/game/textures.ts` | **NEW** — procedural texture generator |
| `apps/web/src/game/ps1Material.ts` | **NEW** — vertex jitter via onBeforeCompile |
| `apps/web/src/game/postProcessing.ts` | **NEW** — CRT EffectComposer setup |
| `apps/web/src/game/engine.ts` | Switch to EffectComposer rendering, pass resolution to jitter, resize handling |
| `apps/web/src/game/scenes/basement.ts` | Replace hex colors with texture types in makeProp/makeWall calls, apply jitter |
| `apps/web/src/game/scenes/bedroom.ts` | Same — texture types + jitter |
| `apps/web/src/game/scenes/attic.ts` | Same — texture types + jitter |
| `apps/web/src/game/player.ts` | Skip jitter on lantern flame/halo materials (keep MeshBasicMaterial) |
| `packages/types/src/index.ts` | Add CRT uniform fields to SceneConfig if needed for per-scene defaults |

## Verification

1. `npm run typecheck` — no TS errors
2. `npm run dev` — open in browser
3. Visual checks:
   - All walls/floors show tiled procedural textures instead of flat colors
   - Geometry visibly wobbles/shimmers as camera moves (vertex jitter)
   - Scanlines visible on screen, edges darkened (vignette), slight RGB split at edges (aberration)
   - Film grain noise animates per-frame
4. Performance: should maintain 60fps at half-res — no new per-frame geometry, just texture lookups + one fullscreen shader pass
5. Existing functionality: fog, lighting, flickering, interactions, corner box overlay all still work
