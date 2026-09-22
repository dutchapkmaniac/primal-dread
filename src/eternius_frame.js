import { CFG } from "./config.js";

// ============================================================================
// update 40: the city's local frame, shared by eternius.js (the game logic),
// eternius_build.js (the geometry) and desert.js (the dunes go flat around it).
// `a` runs from the mountain's heart toward the north-east (the castle side),
// `b` toward the north-west. Inside the city's group: local x = b, local z = a.
// ============================================================================
export const E = () => CFG.eternius;
export const D2R = Math.PI / 180;
export const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function cityLocal(x, z) {
  const C = E(), dx = x - C.cx, dz = z - C.cz;
  return { a: dx * C.ux + dz * C.uz, b: dx * C.vx + dz * C.vz };
}
export function cityWorld(a, b) {
  const C = E();
  return [C.cx + a * C.ux + b * C.vx, C.cz + a * C.uz + b * C.vz];
}
// the dunes go flat around the city (the castle stands on level sand)
export function cityFlatten(x, z) {
  const C = E();
  const [px, pz] = cityWorld(C.flatA, 0);
  const d = Math.hypot(x - px, z - pz), r = Math.hypot(x - C.cx, z - C.cz);
  const cf = Math.max(0, Math.min(1, (d - C.flatR) / 50));
  const cm = Math.max(0, Math.min(1, (r - C.mountainR - 10) / 25));
  return Math.min(cf, cm);
}
// update 41: the lake in front of the castle is ONE organic shape — its edge is a radius from the centre
// (LK.a, 0) in direction phi (0 = away from the castle, pi = toward it): a rounded superellipse, longer away
// from the castle, wide across its front, with a wobbling shoreline; on the castle side the shore runs
// straight along the plinth (a = LK.aFront) so the bridge is still the only way to the gate.
export function lakeR(phi) {
  const LK = E().lake, c = Math.cos(phi), sn = Math.sin(phi);
  const A = c >= 0 ? LK.rFar : LK.rNear, B = LK.rSide, n = 2.4;
  const base = 1 / Math.pow(Math.pow(Math.abs(c) / A, n) + Math.pow(Math.abs(sn) / B, n), 1 / n);
  const wobble = 1 + 0.07 * Math.sin(3 * phi + 0.7) + 0.045 * Math.sin(5 * phi + 2.1) + 0.03 * Math.sin(9 * phi + 1.0);
  let r = base * wobble;
  if (c < -1e-6) r = Math.min(r, (LK.a - LK.aFront) / -c);
  return r;
}
// 0 at the centre, 1 on the shore, >1 on land
export function lakeNorm(a, b) {
  const LK = E().lake, da = a - LK.a;
  return Math.hypot(da, b) / lakeR(Math.atan2(b, da));
}
// inside the water (m: extra metres of shore counted as water)
export function inLake(a, b, m = 0) {
  const LK = E().lake, da = a - LK.a, phi = Math.atan2(b, da);
  return Math.hypot(da, b) < lakeR(phi) + m;
}
export function cityLakeDip(x, z) {
  const { a, b } = cityLocal(x, z);
  const n = lakeNorm(a, b);
  return n < 1 ? E().lake.depth * (1 - n * n) : 0;
}
// the lake's outline as a local polygon (the hole in the grass, the water mesh, the map)
export function lakeOutline(margin = 3, n = 96) {
  const LK = E().lake, pts = [];
  for (let i = 0; i < n; i++) {
    const phi = (i / n) * Math.PI * 2, r = lakeR(phi) + margin;
    pts.push([LK.a + Math.cos(phi) * r, Math.sin(phi) * r]);
  }
  return pts;
}
