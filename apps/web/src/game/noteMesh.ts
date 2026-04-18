import * as THREE from 'three';

/**
 * Creates a weathered paper note mesh — aged, stained, with holes and
 * torn edges baked into a canvas texture. Looks like something found
 * in an abandoned house, not a fresh printout.
 */
export function createNoteMesh(width = 0.18, height = 0.25): THREE.Mesh {
  const texW = 128;
  const texH = Math.round(texW * (height / width));

  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d')!;

  // ── base: aged yellow-brown paper ──
  ctx.fillStyle = '#d4c8a0';
  ctx.fillRect(0, 0, texW, texH);

  // ── stain blotches — random dark spots ──
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * texW;
    const y = Math.random() * texH;
    const r = 6 + Math.random() * 18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${80 + Math.random() * 40}, ${60 + Math.random() * 30}, ${30 + Math.random() * 20}, ${0.15 + Math.random() * 0.2})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, texW, texH);
  }

  // ── fiber texture — faint horizontal lines ──
  ctx.strokeStyle = 'rgba(160, 140, 100, 0.12)';
  ctx.lineWidth = 0.5;
  for (let y = 0; y < texH; y += 2 + Math.random() * 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(texW, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }

  // ── holes — transparent circles punched through ──
  ctx.globalCompositeOperation = 'destination-out';
  const holeCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < holeCount; i++) {
    const hx = 10 + Math.random() * (texW - 20);
    const hy = 10 + Math.random() * (texH - 20);
    const hr = 2 + Math.random() * 5;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── torn edges — irregular transparent bites along borders ──
  for (let i = 0; i < 12; i++) {
    const side = Math.floor(Math.random() * 4);
    let ex: number, ey: number;
    if (side === 0) { ex = Math.random() * texW; ey = Math.random() * 8; }       // top
    else if (side === 1) { ex = Math.random() * texW; ey = texH - Math.random() * 8; } // bottom
    else if (side === 2) { ex = Math.random() * 8; ey = Math.random() * texH; }  // left
    else { ex = texW - Math.random() * 8; ey = Math.random() * texH; }           // right
    const er = 2 + Math.random() * 6;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── burn / scorch marks at edges ──
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 4; i++) {
    const bx = Math.random() < 0.5 ? Math.random() * 15 : texW - Math.random() * 15;
    const by = Math.random() * texH;
    const br = 5 + Math.random() * 10;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, 'rgba(40, 20, 10, 0.5)');
    bg.addColorStop(0.6, 'rgba(60, 30, 15, 0.2)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, texW, texH);
  }

  // ── faint text lines (illegible scrawl suggesting writing) ──
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(50, 35, 20, 0.25)';
  ctx.lineWidth = 0.8;
  const lineSpacing = texH / 12;
  for (let row = 0; row < 8; row++) {
    const y = 15 + row * lineSpacing;
    const lineLen = texW * (0.5 + Math.random() * 0.4);
    const startX = 8 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    // Wobbly line simulating handwriting
    for (let x = startX; x < startX + lineLen; x += 3) {
      ctx.lineTo(x, y + (Math.random() - 0.5) * 2);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter; // PS1 pixelated look

  const mat = new THREE.MeshLambertMaterial({
    map: texture,
    flatShading: true,
    transparent: true,
    alphaTest: 0.1, // holes become actual transparent cutouts
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return mesh;
}
