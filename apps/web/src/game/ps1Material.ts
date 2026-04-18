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
