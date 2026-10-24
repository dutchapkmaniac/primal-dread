// update 81 (prompt 40): SKULL VALLEY's shape - pure functions of CFG.skull, shared by world.js (the ground), entities.js
// (who may cross the line) and skull.js (the valley itself). Nothing here imports the world, so nothing cycles.
import { CFG } from "./config.js?v=82";

export function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const u = clamp01(((x - ax) * dx + (z - az) * dz) / L2);
  return Math.hypot(x - (ax + dx * u), z - (az + dz * u));
}
export function skullInside(x, z) { return CFG.skull ? pointInPoly(CFG.skull.poly, x, z) : false; }
export function tunnelDist(x, z) {
  let best = 1e9;
  for (const [a, b] of CFG.skull.tunnels) best = Math.min(best, segDist(x, z, a[0], a[1], b[0], b[1]));
  return best;
}
// the cliff heightfield: the red-line ridge along the north-west edge, the inner ridges, and the tunnels cut through them
export function skullH(x, z) {
  const S = CFG.skull; if (!S) return 0;
  let h = 0;   // the edge ridge straddles the line: it rises outside the poly too, so the cliff has an outer face
  const jag = 0.8 + 0.2 * Math.sin(x * 0.37 + 1.3) * Math.cos(z * 0.29) + 0.08 * Math.sin((x - z) * 0.9);
  const ridge = (ax, az, bx, bz, H, W) => {
    const d = segDist(x, z, ax, az, bx, bz); if (d >= W) return;
    const t = Math.min(1, (1 - d / W) / 0.55);
    h = Math.max(h, H * jag * t * t * (3 - 2 * t));
  };
  const P = S.poly;
  for (let i = 0; i < S.edgeN; i++) {
    let ax = P[i][0], az = P[i][1]; const bx = P[i + 1][0], bz = P[i + 1][1];
    if (i === 0 && S.edgeStart) { const L = Math.hypot(bx - ax, bz - az) || 1; ax += (bx - ax) / L * S.edgeStart; az += (bz - az) / L * S.edgeStart; }   // the first ridge starts clear of the river
    ridge(ax, az, bx, bz, S.edgeRidge.h, S.edgeRidge.w);
  }
  for (const line of S.ridges) for (let i = 0; i < line.length - 1; i++) ridge(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], S.ridgeH, S.ridgeW);
  if (h > 0 && tunnelDist(x, z) < S.tunnelHw) return 0;   // the tunnels are cut through the rock
  return h;
}
// a hill-grid cell (ix, iz, grid G) that belongs to the valley: its centre inside the poly, or the cliff rising at any corner
export function skullCell(ix, iz, G) {
  if (!CFG.skull) return false;
  const cx = (ix + 0.5) * G, cz = (iz + 0.5) * G;
  if (skullInside(cx, cz)) return true;
  return skullH(cx, cz) > 0 || skullH(ix * G, iz * G) > 0 || skullH((ix + 1) * G, iz * G) > 0 || skullH(ix * G, (iz + 1) * G) > 0 || skullH((ix + 1) * G, (iz + 1) * G) > 0;
}
