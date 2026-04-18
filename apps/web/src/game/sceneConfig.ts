import type { SceneConfig } from '@phobos/types';

export const SCENE_CONFIGS: Record<string, SceneConfig> = {
  campus: {
    dimensions: { width: 120, height: 20, depth: 60 },
    ambientColor: 0x887a58,
    ambientIntensity: 1.1,
    fogColor: 0x1a2214,
    fogNear: 8,
    fogFar: 55,
  },
  basement: {
    dimensions: { width: 8, height: 3, depth: 8 },
    ambientColor: 0xb0a080,
    ambientIntensity: 1.1,
    fogColor: 0x1c1810,
    fogNear: 4,
    fogFar: 26,
  },
  bedroom: {
    dimensions: { width: 6, height: 3, depth: 7 },
    ambientColor: 0x9ea0c8,
    ambientIntensity: 1.15,
    fogColor: 0x1a1624,
    fogNear: 4,
    fogFar: 24,
  },
  attic: {
    dimensions: { width: 10, height: 2.5, depth: 6 },
    ambientColor: 0xa08050,
    ambientIntensity: 0.95,
    fogColor: 0x14100a,
    fogNear: 3.5,
    fogFar: 22,
  },
  // ── Prospect Avenue eating clubs (interiors) ──────────────────────────
  tower: {
    dimensions: { width: 10, height: 4.5, depth: 8 },
    ambientColor: 0xb4a078,
    ambientIntensity: 1.15,
    fogColor: 0x1a1208,
    fogNear: 5,
    fogFar: 22,
  },
  cannon: {
    dimensions: { width: 11, height: 4.2, depth: 8 },
    ambientColor: 0xaa9e86,
    ambientIntensity: 1.1,
    fogColor: 0x18181a,
    fogNear: 5,
    fogFar: 22,
  },
  ivy: {
    dimensions: { width: 10, height: 4.0, depth: 8 },
    ambientColor: 0xb49070,
    ambientIntensity: 1.15,
    fogColor: 0x1a1008,
    fogNear: 5,
    fogFar: 22,
  },
  cottage: {
    dimensions: { width: 14, height: 5.0, depth: 8 },
    ambientColor: 0xd8d0b8,
    ambientIntensity: 1.3,
    fogColor: 0x20180e,
    fogNear: 6,
    fogFar: 26,
  },
  capgown: {
    dimensions: { width: 10, height: 4.6, depth: 9 },
    ambientColor: 0xa8a6a0,
    ambientIntensity: 1.1,
    fogColor: 0x141216,
    fogNear: 5,
    fogFar: 22,
  },
  colonial: {
    dimensions: { width: 11, height: 4.5, depth: 8 },
    ambientColor: 0xcec4b0,
    ambientIntensity: 1.25,
    fogColor: 0x1a1a1a,
    fogNear: 6,
    fogFar: 24,
  },
  tigerinn: {
    dimensions: { width: 10, height: 3.8, depth: 8 },
    ambientColor: 0xa08054,
    ambientIntensity: 1.05,
    fogColor: 0x120c06,
    fogNear: 4,
    fogFar: 20,
  },
  terrace: {
    dimensions: { width: 12, height: 3.6, depth: 8 },
    ambientColor: 0xa89880,
    ambientIntensity: 1.05,
    fogColor: 0x140f08,
    fogNear: 4,
    fogFar: 20,
  },
  cloister: {
    dimensions: { width: 12, height: 4.8, depth: 9 },
    ambientColor: 0x9ea0a8,
    ambientIntensity: 1.05,
    fogColor: 0x0e1214,
    fogNear: 5,
    fogFar: 24,
  },
  charter: {
    dimensions: { width: 12, height: 4.8, depth: 8 },
    ambientColor: 0xd4c8a8,
    ambientIntensity: 1.25,
    fogColor: 0x1a1a16,
    fogNear: 6,
    fogFar: 24,
  },
};

export function lerpSceneConfig(a: SceneConfig, b: SceneConfig, t: number): SceneConfig {
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    dimensions: {
      width: l(a.dimensions.width, b.dimensions.width),
      height: l(a.dimensions.height, b.dimensions.height),
      depth: l(a.dimensions.depth, b.dimensions.depth),
    },
    ambientColor: a.ambientColor, // color lerp is complex, snap for now
    ambientIntensity: l(a.ambientIntensity, b.ambientIntensity),
    fogColor: a.fogColor,
    fogNear: l(a.fogNear, b.fogNear),
    fogFar: l(a.fogFar, b.fogFar),
  };
}
