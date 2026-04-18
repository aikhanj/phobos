import type { SceneConfig } from '../types';

export const SCENE_CONFIGS: Record<string, SceneConfig> = {
  basement: {
    dimensions: { width: 8, height: 3, depth: 8 },
    ambientColor: 0x111122,
    ambientIntensity: 0.05,
    fogColor: 0x000000,
    fogNear: 1,
    fogFar: 12,
  },
  bedroom: {
    dimensions: { width: 6, height: 3, depth: 7 },
    ambientColor: 0x1a1a2e,
    ambientIntensity: 0.08,
    fogColor: 0x050510,
    fogNear: 2,
    fogFar: 15,
  },
  attic: {
    dimensions: { width: 10, height: 2.5, depth: 6 },
    ambientColor: 0x0a0a0a,
    ambientIntensity: 0.03,
    fogColor: 0x000000,
    fogNear: 0.5,
    fogFar: 10,
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
