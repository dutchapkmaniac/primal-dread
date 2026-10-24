// update 81 (prompt 40): SKULL VALLEY's shape - pure functions of CFG.skull, shared by world.js (the ground), entities.js
// (who may cross the line), map.js and skull.js (the valley itself). Nothing here imports the world, so nothing cycles.
// The valley is a wasteland of rock: the cliff ridge along the user's red line, a mountain wall along the map's edge,
// the drawn ridges, and a seeded field of rocky hills between them, with tunnels bored through the biggest.
import { CFG } from "./config.js?v=83";

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const u = clamp01(((x - ax) * dx + (z - az) * dz) / L2);
  return Math.hypot(x - (ax + dx * u), z - (az + dz * u));
}
export function skullInside(x, z) { return CFG.skull ? pointInPoly(CFG.skull.poly, x, z) : false; }
let B = null;
export function skullBounds() {
  if (B) return B;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of CFG.skull.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return (B = { x0, z0, x1, z1 });
}
// the spots that stay level: the camp, the dens, the great skull, the bridge landing (factor 0 inside, 1 beyond the blend)
export function skullFlat(x, z) {
  const S = CFG.skull; let f = 1;
  for (const [fx, fz, r] of S.flats) { const d = Math.hypot(x - fx, z - fz); if (d < r + 24) f = Math.min(f, smooth((d - r) / 24)); }
  return f;
}
// the rocky hills: seeded once, kept off the level spots, the tunnels and the river bank
let HILLS = null, TUNNELS = null;
export function skullHills() {
  if (HILLS) return HILLS;
  const S = CFG.skull, P = S.poly, b = skullBounds();
  let seed = S.hillSeed; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const riverSide = []; for (let i = S.edgeN + 2; i < P.length; i++) riverSide.push([P[i], P[(i + 1) % P.length]]);
  const out = [];
  for (let k = 0; k < S.hillTries && out.length < S.hillCount; k++) {
    const x = b.x0 + rng() * (b.x1 - b.x0), z = b.z0 + rng() * (b.z1 - b.z0);
    if (!pointInPoly(P, x, z)) continue;
    const r = S.hillR[0] + rng() * (S.hillR[1] - S.hillR[0]), h = S.hillH[0] + rng() * (S.hillH[1] - S.hillH[0]);
    if (skullFlat(x, z) < 0.999) continue;
    if (riverSide.some(([a, c]) => segDist(x, z, a[0], a[1], c[0], c[1]) < r + 30)) continue;
    if (S.tunnels.some(([a, c]) => segDist(x, z, a[0], a[1], c[0], c[1]) < r + 12)) continue;
    if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < (o[2] + r) * S.hillGap)) continue;
    out.push([x, z, r, h, rng() * 6.28]);
  }
  HILLS = out; return out;
}
// the tunnels: the drawn four, plus one bored through each of the biggest hills
export function skullTunnels() {
  if (TUNNELS) return TUNNELS;
  const S = CFG.skull, list = S.tunnels.map((t) => t);
  const big = skullHills().slice().sort((a, b) => b[2] - a[2]).slice(0, S.hillTunnels);
  for (const [x, z, r, , a] of big) { const L = r * 0.8; /* ends just inside the hill's foot, so the bore frame stays buried */ list.push([[x - Math.sin(a) * L, z - Math.cos(a) * L], [x + Math.sin(a) * L, z + Math.cos(a) * L]]); }
  TUNNELS = list; return list;
}
export function tunnelDist(x, z) {
  let best = 1e9;
  for (const [a, b] of skullTunnels()) best = Math.min(best, segDist(x, z, a[0], a[1], b[0], b[1]));
  return best;
}
// the heightfield
export function skullH(x, z) {
  const S = CFG.skull; if (!S) return 0;
  const b = skullBounds(); if (x < b.x0 - 80 || x > b.x1 + 80 || z < b.z0 - 80 || z > b.z1 + 80) return 0;
  let h = 0;
  const jag = 0.8 + 0.2 * Math.sin(x * 0.37 + 1.3) * Math.cos(z * 0.29) + 0.08 * Math.sin((x - z) * 0.9);
  const ridge = (ax, az, bx, bz, H, W) => {
    const d = segDist(x, z, ax, az, bx, bz); if (d >= W) return;
    const t = Math.min(1, (1 - d / W) / 0.55);
    h = Math.max(h, H * jag * smooth(t));
  };
  const P = S.poly;
  for (let i = 0; i < S.edgeN; i++) {   // the cliff along the red line (its first stretch starts clear of the river)
    let ax = P[i][0], az = P[i][1]; const bx = P[i + 1][0], bz = P[i + 1][1];
    if (i === 0 && S.edgeStart) { const L = Math.hypot(bx - ax, bz - az) || 1; ax += (bx - ax) / L * S.edgeStart; az += (bz - az) / L * S.edgeStart; }
    ridge(ax, az, bx, bz, S.edgeRidge.h, S.edgeRidge.w);
  }
  for (const line of S.ridges) for (let i = 0; i < line.length - 1; i++) ridge(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], S.ridgeH, S.ridgeW);
  for (const [hx, hz, r, H, a] of skullHills()) {   // the hills: a stretched bump, broken by the jag
    const dx = x - hx, dz = z - hz; if (Math.abs(dx) > r * 1.4 || Math.abs(dz) > r * 1.4) continue;
    const u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a);
    const d = Math.hypot(u / 1.35, v) / r; if (d >= 1) continue;
    h = Math.max(h, H * jag * smooth((1 - d) / 0.7));
  }
  h *= skullFlat(x, z);
  // the mountain wall along the map's edge (the valley's south and east sides), never levelled
  if (S.edgeWall) { for (let i = S.edgeN; i < S.edgeN + 2; i++) { const d = segDist(x, z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]); if (d < S.edgeWall.w) h = Math.max(h, S.edgeWall.h * (0.85 + 0.15 * jag) * smooth((1 - d / S.edgeWall.w) / 0.6)); } }
  if (h > 0 && tunnelDist(x, z) < S.tunnelHw) return 0;   // the tunnels are cut through the rock
  return h;
}
// a hill-grid cell (ix, iz, grid G) that belongs to the valley: its centre inside the poly, or the cliff rising at any corner
export function skullCell(ix, iz, G) {
  if (!CFG.skull) return false;
  const cx = (ix + 0.5) * G, cz = (iz + 0.5) * G, b = skullBounds();
  if (cx < b.x0 - 80 || cx > b.x1 + 80 || cz < b.z0 - 80 || cz > b.z1 + 80) return false;
  if (skullInside(cx, cz)) return true;
  return skullH(cx, cz) > 0 || skullH(ix * G, iz * G) > 0 || skullH((ix + 1) * G, iz * G) > 0 || skullH(ix * G, (iz + 1) * G) > 0 || skullH((ix + 1) * G, (iz + 1) * G) > 0;
}
