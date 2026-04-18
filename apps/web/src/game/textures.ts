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
