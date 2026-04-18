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
    uVignetteRadius: { value: 0.72 },
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
