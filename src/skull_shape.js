// update 81 (prompt 40): SKULL VALLEY's shape - pure functions of CFG.skull, shared by world.js (the ground), entities.js
// (who may cross the line), map.js and skull.js (the valley itself). Nothing here imports the world, so nothing cycles.
// The valley is a wasteland of rock: the cliff ridge along the user's red line, a mountain wall along the map's edge,
// the drawn ridges, and a seeded field of rocky hills between them, with tunnels bored through the biggest.
import { CFG } from "./config.js?v=88";

// update 85: the first 60 m of the Bone Mentor's tunnel lie in the wall's rising foot. Where the rock's surface would cut
// through the tube (lower than its roof) it is pushed a metre under the tube's floor instead - inside the skull mouth that
// hollow is never seen; where the rock already clears the roof the tube is buried and nothing changes.
function boneMouthCut(x, z, h) {
  const B = CFG.bone; if (!B || !B.path) return h;
  const P = B.path, hw = (B.halfW || 7) + 2.5, H = B.height || 12; let s0 = 0;
  for (let i = 0; i + 1 < P.length && s0 < 60; i++) {
    const [ax, az, ay] = P[i], [bx, bz, by] = P[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const px = ax + dx * t, pz = az + dz * t, lat = Math.hypot(x - px, z - pz), sl = s0 + t * L;
    if (lat < hw && sl > -9 && sl < 60) { const fy = ay + (by - ay) * t; if (h < fy + H + 2) return Math.min(h, fy - 0.12); }   /* update 86: from 9 m before the portal's front, a hand under the floor */
    s0 += L;
  }
  return h;
}

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
  for (const [hx, hz, r, h, a] of S.fixedHills || []) out.push([hx, hz, r, h, a]);   // the hills the dens are carved into
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
// the hills bucketed on a 60 m grid: a height query loops only the hills that reach its cell
let HGRID = null;
function hillGrid() {
  if (HGRID) return HGRID;
  const b = skullBounds(), C = 60, x0 = b.x0 - 80, z0 = b.z0 - 80, nx = Math.ceil((b.x1 + 80 - x0) / C) + 1, nz = Math.ceil((b.z1 + 80 - z0) / C) + 1;
  const cells = new Array(nx * nz); for (let i = 0; i < cells.length; i++) cells[i] = [];
  skullHills().forEach((h) => { const R = h[2] * 1.4; const i0 = Math.max(0, Math.floor((h[0] - R - x0) / C)), i1 = Math.min(nx - 1, Math.floor((h[0] + R - x0) / C)), j0 = Math.max(0, Math.floor((h[1] - R - z0) / C)), j1 = Math.min(nz - 1, Math.floor((h[1] + R - z0) / C)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(h); });
  HGRID = { x0, z0, C, nx, nz, cells }; return HGRID;
}
function hillsNear(x, z) { const G = hillGrid(); const i = Math.floor((x - G.x0) / G.C), j = Math.floor((z - G.z0) / G.C); if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return []; return G.cells[j * G.nx + i]; }
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
  const jag = 0.82 + 0.18 * Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + 0.07 * Math.sin((x - z) * 0.2);
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
  for (const [hx, hz, r, H, a] of hillsNear(x, z)) {   // the hills: a stretched bump, broken by the jag
    const dx = x - hx, dz = z - hz; if (Math.abs(dx) > r * 1.4 || Math.abs(dz) > r * 1.4) continue;
    const u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a);
    const d = Math.hypot(u / 1.35, v) / r; if (d >= 1) continue;
    h = Math.max(h, H * jag * smooth((1 - d) / 0.7));
  }
  if (h > 0) h *= skullFlat(x, z);
  // the mountain wall along the map's edge (the valley's south and east sides), never levelled
  if (S.edgeWall) { for (let i = S.edgeN; i < S.edgeN + 2; i++) { const d = segDist(x, z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]); if (d < S.edgeWall.w) h = Math.max(h, S.edgeWall.h * (0.85 + 0.15 * jag) * smooth((1 - d / S.edgeWall.w) / 0.6)); } }
  if (h > 0) { const td = tunnelDist(x, z); if (td < S.tunnelHw) return 0; if (td < S.tunnelHw + S.tunnelNotch) h *= smooth((td - S.tunnelHw) / S.tunnelNotch); }   // the tunnels are cut through the rock, the cut's sides notched
  h = boneMouthCut(x, z, h);   /* update 85 */
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

// the node height of the valley mesh (skull.js builds its triangles from exactly this): the cliff where it rises, the
// forest's own hill height elsewhere (the river dip, the level sand)
export function skullNode(ix, iz, G, hillAt) {
  const x = ix * G, z = iz * G, sh = skullH(x, z), hh = hillAt ? hillAt(ix, iz) : 0;
  return sh > 0 ? Math.max(sh, hh) : hh;
}
// the height of the drawn surface at (x, z): the same two triangles per cell as the mesh (a,b,d / b,c,d)
export function skullGround(x, z, G, hillAt) {
  const gx = x / G, gz = z / G, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const ha = skullNode(ix, iz, G, hillAt), hb = skullNode(ix, iz + 1, G, hillAt), hc = skullNode(ix + 1, iz + 1, G, hillAt), hd = skullNode(ix + 1, iz, G, hillAt);
  return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}
