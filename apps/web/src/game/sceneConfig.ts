import type { SceneConfig } from '@phobos/types';

export const SCENE_CONFIGS: Record<string, SceneConfig> = {
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
